
import express from "express";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URL);

let booksCollection;
let borrowingsCollection;

async function connectToMongoDB() {
  try {
    await client.connect();

    console.log("You successfully connected to MongoDB!");

    const database = client.db("bookstore");

    booksCollection = database.collection("books");
    borrowingsCollection = database.collection("borrowings");

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
    const result = await booksCollection.insertOne(req.body);

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

// Get Single Book
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

// Delete Book
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

// Borrow Book
app.post("/borrow", async (req, res) => {
  try {
    const { bookId, borrowerName, borrowerEmail } = req.body;

    if (
      !ObjectId.isValid(bookId) ||
      !borrowerName?.trim() ||
      !borrowerEmail?.trim()
    ) {
      return res.status(400).send({
        message: "Please provide valid borrowing information",
      });
    }

    // Check if book is available and decrease copies by 1
    const book = await booksCollection.findOneAndUpdate(
      {
        _id: new ObjectId(bookId),
        copies: { $gt: 0 },
      },
      {
        $inc: { copies: -1 },
      },
      {
        returnDocument: "after",
      }
    );

    const updatedBook = book?.value ?? book;

    if (!updatedBook) {
      return res.status(400).send({
        message: "This book is currently unavailable",
      });
    }

    const borrowDate = new Date();
    const dueDate = new Date(borrowDate);

    // Add 7 calendar days
    dueDate.setDate(dueDate.getDate() + 7);

    const borrowing = {
      bookId: new ObjectId(bookId),
      bookTitle: updatedBook.title,
      bookAuthor: updatedBook.author,
      bookImage: updatedBook.imageUrl || "",
      borrowerName: borrowerName.trim(),
      borrowerEmail: borrowerEmail.trim().toLowerCase(),
      borrowDate,
      dueDate,
      status: "borrowed",
      returnedAt: null,
    };

    try {
      await borrowingsCollection.insertOne(borrowing);
    } catch (insertError) {
      // Restore copies if saving the borrowing record fails
      await booksCollection.updateOne(
        { _id: new ObjectId(bookId) },
        { $inc: { copies: 1 } }
      );

      throw insertError;
    }

    res.status(201).send({
      message: "Book borrowed successfully",
      borrowing,
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to borrow book",
      error: error.message,
    });
  }
});

// Get My Borrowed Books
app.get("/my-borrows", async (req, res) => {
  try {
    const email = req.query.email;

    if (!email) {
      return res.status(400).send({
        message: "Email is required",
      });
    }

    const borrowings = await borrowingsCollection
      .find({
        borrowerEmail: email.toLowerCase(),
        status: "borrowed",
      })
      .sort({ borrowDate: -1 })
      .toArray();

    res.status(200).send(borrowings);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch borrowed books",
      error: error.message,
    });
  }
});

// Return Book
app.patch("/return/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const email = req.body.email;

    if (!ObjectId.isValid(id) || !email) {
      return res.status(400).send({
        message: "Invalid borrowing information",
      });
    }

    const borrowing = await borrowingsCollection.findOne({
      _id: new ObjectId(id),
      borrowerEmail: email.toLowerCase(),
      status: "borrowed",
    });

    if (!borrowing) {
      return res.status(404).send({
        message: "Borrowing record not found",
      });
    }

    // Mark as returned only if it is still borrowed
    const result = await borrowingsCollection.updateOne(
      {
        _id: new ObjectId(id),
        borrowerEmail: email.toLowerCase(),
        status: "borrowed",
      },
      {
        $set: {
          status: "returned",
          returnedAt: new Date(),
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).send({
        message: "This book has already been returned",
      });
    }

    await booksCollection.updateOne(
      { _id: borrowing.bookId },
      { $inc: { copies: 1 } }
    );

    res.status(200).send({
      message: "Book returned successfully",
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to return book",
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
