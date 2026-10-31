import express from "express";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

const app = express();
const PORT = 8000;

app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URL);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }
}

app.get("/", (req, res) => {
  res.send({ message: "Server is running fine!" });
});

async function startServer() {
  await connectToMongoDB();

  app.listen(PORT, () => {
    console.log(`Server is running at ${PORT}`);
  });
}

startServer();