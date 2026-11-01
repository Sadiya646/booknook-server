import express from "express";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URL);

let booksCollection;

// MongoDB Connection
async function connectToMongoDB() {
  try {
    await client.connect();

    console.log("You successfully connected to MongoDB!");

    const database = client.db("bookstore");
    booksCollection = database.collection("books");

  } catch (err) {
    console.error("MongoDB connection failed:", err);
    process.exit(1);
  }
}

// Add Book API
app.post("/add-book", async (req, res) => {
  try {
    const data = req.body;

    const result = await booksCollection.insertOne(data);

    res.send({
      message: "Book added successfully",
      result,
    });

  } catch (error) {
    res.status(500).send({
      message: "Something went wrong",
      error: error.message,
    });
  }
});


// Get all books
app.get("/books", async (req, res) => {
  try {
    const books = await booksCollection.find({}).toArray();

    res.status(200).send(books);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch books",
      error: error.message,
    });
  }
});


// Home API
app.get("/", (req, res) => {
  res.send({ message: "Server is running fine!" });
});

// Start Server
async function startServer() {
  await connectToMongoDB();

  app.listen(PORT, () => {
    console.log(`Server is running at ${PORT}`);
  });
}

startServer();