import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
//import csvParser from "fast-csv";
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

// LTV Calculation Function
const calculateLTV = (data: any[]): any[] => {
  const customers: Record<string, {
    totalRevenue: number;
    orders: number;
    firstPurchase: string;
    lastPurchase: string;
  }> = {};

  data.forEach(row => {
    const customerId = row["Customer ID"];
    const orderValue = parseFloat(row["Order Value"]);
    const orderDate = row["Order Date"];

    if (!customers[customerId]) {
      customers[customerId] = {
        totalRevenue: 0,
        orders: 0,
        firstPurchase: orderDate,
        lastPurchase: orderDate
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
  });

  return Object.keys(customers).map(customerId => {
    const { totalRevenue, orders, firstPurchase, lastPurchase } = customers[customerId];
    const avgOrderValue = totalRevenue / orders;
    const purchaseFrequency = orders;
    const customerLifespan =
      (new Date(lastPurchase).getTime() - new Date(firstPurchase).getTime()) / (1000 * 3600 * 24) || 1;
    const ltv = avgOrderValue * purchaseFrequency * customerLifespan;

    return {
      CustomerID: customerId,
      TotalRevenue: totalRevenue.toFixed(2),
      Orders: orders,
      AvgOrderValue: avgOrderValue.toFixed(2),
      PurchaseFrequency: purchaseFrequency,
      CustomerLifespan: customerLifespan.toFixed(2),
      LTV: ltv.toFixed(2)
    };
  });
};

// Root route for testing
app.get("/", (req, res) => {
  res.send("LTV Report Server is running...");
});

// Upload route
app.post("/upload", upload.single("file"), (req: MulterRequest, res: Response): void => {
  const fileReq = req as MulterRequest;

  if (!fileReq.file) {
    res.status(400).json({ message: "No file uploaded" });
    return;
  }

  //const filePath = path.join(__dirname, fileReq.file.path);
  const filePath = fileReq.file.path;
  const results: any[] = [];

  fs.createReadStream(filePath)
   .pipe(parse({ headers: true }))
    .on("data", row => results.push(row))
    .on("end", () => {
      fs.unlinkSync(filePath); // Delete file after processing
    //   const report = calculateLTV(results);
    //   res.json({ success: true, data: report });

    try {
        // Check for required columns
        const requiredHeaders = ["Customer ID", "Order Date", "Order Value"];
        const csvHeaders = Object.keys(results[0] || {});
        const missingHeaders = requiredHeaders.filter(h => !csvHeaders.includes(h));
      
        if (missingHeaders.length > 0) {
          return res.status(400).json({
            error: `Missing required columns: ${missingHeaders.join(", ")}`
          });
        }
      
        const report = calculateLTV(results);
        res.json({ success: true, data: report });
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
