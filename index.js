
import express from "express";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URL);

let booksCollection;

async function connectToMongoDB() {
  try {
    await client.connect();

    console.log("You successfully connected to MongoDB!");

    const database = client.db("bookstore");
    booksCollection = database.collection("books");

  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
}

// Home API
app.get("/", (req, res) => {
  res.status(200).send({
    message: "Server is running fine!",
  });
});

// Add New Book
app.post("/add-book", async (req, res) => {
  try {
    const data = req.body;

    const result = await booksCollection.insertOne(data);

    res.status(201).send({
      message: "Book added successfully",
      insertedId: result.insertedId,
    });

  } catch (error) {
    res.status(500).send({
      message: "Failed to add book",
      error: error.message,
    });
  }
});

// Get All Books
app.get("/books", async (req, res) => {
  try {
    const books = await booksCollection
      .find({})
      .sort({ _id: -1 })
      .toArray();

    res.status(200).send(books);

  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch books",
      error: error.message,
    });
  }
});

// Get Single Book by ID
app.get("/books/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    const book = await booksCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found",
      });
    }

    res.status(200).send(book);

  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch book",
      error: error.message,
    });
  }
});

// Delete Book by ID
app.delete("/books/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    const result = await booksCollection.deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "Book not found",
      });
    }

    res.status(200).send({
      message: "Book deleted successfully",
    });

  } catch (error) {
    res.status(500).send({
      message: "Failed to delete book",
      error: error.message,
    });
  }
});

// Start Server
async function startServer() {
  try {
    await connectToMongoDB();

    app.listen(PORT, () => {
      console.log(`Server is running at http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error("Server startup failed:", error);
    process.exit(1);
  }
}

startServer();
