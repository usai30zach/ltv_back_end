import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { parse } from "fast-csv";
import fs from "fs";

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

// Multer setup for file uploads
const upload = multer({ dest: "uploads/" });

// Extend the Request type to include Multer's file field
interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

// LTV Calculation Function based on new CSV structure
const calculateLTV = (data: any[]): any[] => {
    const customers: Record<string, {
      totalRevenue: number;
      orders: number;
      firstPurchase: string;
      lastPurchase: string;
      months: Record<string, number>; // month key -> order count
    }> = {};
  
    data.forEach(row => {
      const customerId = row["Customer"];
      const orderValue = parseFloat(row["Total"]);
      const orderDate = row["Sales Order Date"];
  
      if (!customerId || isNaN(orderValue) || !orderDate) return;
  
      const date = new Date(orderDate);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

      if (!customers[customerId]) {
        customers[customerId] = {
          totalRevenue: 0,
          orders: 0,
          firstPurchase: orderDate,
          lastPurchase: orderDate,
          months: {},
        };
      }
  
      customers[customerId].totalRevenue += orderValue;
      customers[customerId].orders += 1;
      customers[customerId].firstPurchase = customers[customerId].firstPurchase < orderDate
        ? customers[customerId].firstPurchase
        : orderDate;
      customers[customerId].lastPurchase = customers[customerId].lastPurchase > orderDate
        ? customers[customerId].lastPurchase
        : orderDate;
        customers[customerId].months[monthKey] = (customers[customerId].months[monthKey] || 0) + 1;
    });
  
    return Object.keys(customers).map(customerId => {
        const { totalRevenue, orders, firstPurchase, lastPurchase, months } = customers[customerId];
      const avgOrderValue = totalRevenue / orders;
      const lifespanDays = (new Date(lastPurchase).getTime() - new Date(firstPurchase).getTime()) / (1000 * 3600 * 24) || 1;
      const lifespanMonths = lifespanDays / 30; // approximate month
    //   const avgRetention = orders / lifespanMonths;
    const monthCounts = Object.values(months);
    const avgRetention = monthCounts.length > 0
      ? monthCounts.reduce((a, b) => a + b, 0) / monthCounts.length
      : 0;
  
      const ltv = avgOrderValue * orders * avgRetention;
  
      return {
        CustomerID: customerId,
        TotalRevenue: totalRevenue.toFixed(2),
        Orders: orders,
        AvgSale: avgOrderValue.toFixed(2),
        AvgRetention: avgRetention.toFixed(2),
        PurchaseFrequency: orders,
        LTV: ltv.toFixed(2)
      };
    });
  };
  
  

// Upload route
app.post("/upload", upload.single("file"), (req: MulterRequest, res: Response): void => {
  const fileReq = req as MulterRequest;

  if (!fileReq.file) {
    res.status(400).json({ message: "No file uploaded" });
    return;
  }

  const filePath = fileReq.file.path;
  const results: any[] = [];

  fs.createReadStream(filePath)
    .pipe(parse({ headers: true }))
    .on("data", row => results.push(row))
    .on("end", () => {
      fs.unlinkSync(filePath); // Delete file after processing
      try {
        const requiredHeaders = ["SO#", "Sales Order Title", "Customer", "Total", "Status", "Invoiced %", "Payments", "Balance", "Due Date", "Profit", "Tax Name", "IN#", "Created At", "Sales Order Date"];
        const csvHeaders = Object.keys(results[0] || {});
        const missingHeaders = requiredHeaders.filter(h => !csvHeaders.includes(h));

        if (missingHeaders.length > 0) {
          return res.status(400).json({
            error: `Missing required columns: ${missingHeaders.join(", ")}`
          });
        }
        //console.log("Sample Customer names in CSV:", results.map(r => r["Customer"]));
        const report = calculateLTV(results);
        //res.json({ success: true, data: report });
        res.json({ success: true, data: report, orders: results });
      } catch (err) {
        res.status(500).json({ error: "Failed to process CSV file" });
      }
    })
    .on("error", error => {
      res.status(500).json({ error: error.message });
    });
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
