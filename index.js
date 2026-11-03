
import express from "express";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import { jwtVerify, createRemoteJWKSet } from "jose";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

const FRONTEND_URL =
  process.env.FRONTEND_URL || "http://localhost:3000";

// =====================================
// MIDDLEWARE
// =====================================

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

app.use(express.json());

// =====================================
// MONGODB
// =====================================

const client = new MongoClient(process.env.MONGODB_URL);

let booksCollection;
let borrowingsCollection;

// =====================================
// BETTER AUTH JWT VERIFICATION
// =====================================

const JWKS = createRemoteJWKSet(
  new URL(`${FRONTEND_URL}/api/auth/jwks`)
);

async function verifyToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).send({
        message: "Unauthorized request. Please login.",
      });
    }

    const token = authHeader.split(" ")[1];

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: FRONTEND_URL,
      audience: FRONTEND_URL,
    });

    if (!payload.email || typeof payload.email !== "string") {
      return res.status(401).send({
        message: "Invalid user token.",
      });
    }

    req.user = {
      id: payload.sub || payload.id,
      email: payload.email.trim().toLowerCase(),
      name: payload.name || "",
    };

    next();
  } catch (error) {
    console.error("JWT verification error:", error);

    return res.status(401).send({
      message: "Invalid or expired token.",
    });
  }
}

// =====================================
// HOME
// =====================================

app.get("/", (req, res) => {
  res.send("BookNook Server is Running");
});

// =====================================
// ADD BOOK
// =====================================

app.post("/add-book", verifyToken, async (req, res) => {
  try {
    const {
      title,
      author,
      category,
      description,
      imageUrl,
      totalCopies,
    } = req.body;

    const total = Number(totalCopies);

    if (
      !title?.trim() ||
      !author?.trim() ||
      !category ||
      !description?.trim() ||
      !imageUrl?.trim() ||
      !Number.isInteger(total) ||
      total < 1
    ) {
      return res.status(400).send({
        message: "Please provide valid book information.",
      });
    }

    const book = {
      title: title.trim(),
      author: author.trim(),
      category,
      description: description.trim(),
      imageUrl: imageUrl.trim(),
      totalCopies: total,
      copies: total,
      userName: req.user.name,
      userEmail: req.user.email,
      createdAt: new Date(),
    };

    const result = await booksCollection.insertOne(book);

    res.status(201).send({
      message: "Book added successfully!",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: "Failed to add book",
    });
  }
});

// =====================================
// GET ALL BOOKS
// =====================================

app.get("/books", async (req, res) => {
  try {
    const books = await booksCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).send(books);
  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: "Failed to get books",
    });
  }
});

// =====================================
// GET SINGLE BOOK
// =====================================

app.get("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;

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
    console.error(error);

    res.status(500).send({
      message: "Failed to get book",
    });
  }
});

// =====================================
// MY BOOKS
// =====================================

app.get("/my-books", verifyToken, async (req, res) => {
  try {
    const books = await booksCollection
      .find({
        userEmail: req.user.email,
      })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).send(books);
  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: "Failed to get your books",
    });
  }
});

// =====================================
// UPDATE MY BOOK
// =====================================

app.put("/my-books/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    const {
      title,
      author,
      category,
      description,
      imageUrl,
      totalCopies,
    } = req.body;

    const newTotal = Number(totalCopies);

    if (
      !title?.trim() ||
      !author?.trim() ||
      !category ||
      !description?.trim() ||
      !imageUrl?.trim() ||
      !Number.isInteger(newTotal) ||
      newTotal < 1
    ) {
      return res.status(400).send({
        message: "Please provide valid book information.",
      });
    }

    const bookId = new ObjectId(id);

    const book = await booksCollection.findOne({
      _id: bookId,
      userEmail: req.user.email,
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found or you do not own this book.",
      });
    }

    const oldTotal = Number(book.totalCopies ?? book.copies ?? 0);

    const oldAvailable = Number(
      book.copies ?? book.availableCopies ?? oldTotal
    );

    const borrowedCopies = oldTotal - oldAvailable;
    const newAvailable = newTotal - borrowedCopies;

    if (newAvailable < 0) {
      return res.status(400).send({
        message: `You cannot set total copies below ${borrowedCopies} borrowed copies.`,
      });
    }

    await booksCollection.updateOne(
      {
        _id: bookId,
        userEmail: req.user.email,
      },
      {
        $set: {
          title: title.trim(),
          author: author.trim(),
          category,
          description: description.trim(),
          imageUrl: imageUrl.trim(),
          totalCopies: newTotal,
          copies: newAvailable,
        },
      }
    );

    res.status(200).send({
      message: "Book updated successfully!",
    });
  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: "Failed to update book",
    });
  }
});

// =====================================
// DELETE MY BOOK
// =====================================

app.delete("/my-books/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    const bookId = new ObjectId(id);

    const book = await booksCollection.findOne({
      _id: bookId,
      userEmail: req.user.email,
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found or you do not own this book.",
      });
    }

    const activeBorrowing = await borrowingsCollection.findOne({
      bookId,
      status: "borrowed",
    });

    if (activeBorrowing) {
      return res.status(400).send({
        message: "This book cannot be deleted while it is borrowed.",
      });
    }

    await booksCollection.deleteOne({
      _id: bookId,
      userEmail: req.user.email,
    });

    res.status(200).send({
      message: "Book deleted successfully!",
    });
  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: "Failed to delete book",
    });
  }
});

// =====================================
// BORROW BOOK
// =====================================

app.post("/borrow", verifyToken, async (req, res) => {
  try {
    const { bookId } = req.body;

    if (!bookId || !ObjectId.isValid(bookId)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    const bookObjectId = new ObjectId(bookId);

    const existingBorrowing = await borrowingsCollection.findOne({
      bookId: bookObjectId,
      borrowerEmail: req.user.email,
      status: "borrowed",
    });

    if (existingBorrowing) {
      return res.status(400).send({
        message: "You have already borrowed this book.",
      });
    }

    const book = await booksCollection.findOne({
      _id: bookObjectId,
    });

    if (!book) {
      return res.status(404).send({
        message: "Book not found",
      });
    }

    const copiesField =
      book.copies !== undefined ? "copies" : "availableCopies";

    const availableCopies = Number(
      book[copiesField] ?? 0
    );

    if (availableCopies < 1) {
      return res.status(400).send({
        message: "This book is currently unavailable.",
      });
    }

    const borrowDate = new Date();

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const updateResult = await booksCollection.updateOne(
      {
        _id: bookObjectId,
        [copiesField]: { $gt: 0 },
      },
      {
        $inc: {
          [copiesField]: -1,
        },
      }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(400).send({
        message: "This book is currently unavailable.",
      });
    }

    const borrowing = {
      bookId: bookObjectId,
      bookTitle: book.title,
      bookAuthor: book.author || "",
      bookImage: book.imageUrl || book.image || "",
      borrowerName: req.user.name,
      borrowerEmail: req.user.email,
      borrowDate,
      dueDate,
      status: "borrowed",
    };

    const borrowingResult =
      await borrowingsCollection.insertOne(borrowing);

    res.status(201).send({
      message: "Book borrowed successfully!",
      borrowingId: borrowingResult.insertedId,
    });
  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: "Failed to borrow book",
    });
  }
});

// =====================================
// MY BORROWED BOOKS
// =====================================

app.get("/my-borrows", verifyToken, async (req, res) => {
  try {
    const borrowings = await borrowingsCollection
      .find({
        borrowerEmail: req.user.email,
        status: "borrowed",
      })
      .sort({ borrowDate: -1 })
      .toArray();

    res.status(200).send(borrowings);
  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: "Failed to get borrowed books",
    });
  }
});

// =====================================
// RETURN BORROWED BOOK
// =====================================

app.patch("/return/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid borrowing ID",
      });
    }

    const borrowingId = new ObjectId(id);

    const borrowing = await borrowingsCollection.findOne({
      _id: borrowingId,
      borrowerEmail: req.user.email,
      status: "borrowed",
    });

    if (!borrowing) {
      return res.status(404).send({
        message: "Borrowing record not found.",
      });
    }

    const updateResult = await borrowingsCollection.updateOne(
      {
        _id: borrowingId,
        borrowerEmail: req.user.email,
        status: "borrowed",
      },
      {
        $set: {
          status: "returned",
          returnedAt: new Date(),
        },
      }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(400).send({
        message: "This book has already been returned.",
      });
    }

    const book = await booksCollection.findOne({
      _id: borrowing.bookId,
    });

    if (book) {
      const copiesField =
        book.copies !== undefined ? "copies" : "availableCopies";

      await booksCollection.updateOne(
        { _id: borrowing.bookId },
        {
          $inc: {
            [copiesField]: 1,
          },
        }
      );
    }

    res.status(200).send({
      message: "Book returned successfully!",
    });
  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: "Failed to return book",
    });
  }
});

// =====================================
// START SERVER
// =====================================

async function startServer() {
  try {
    await client.connect();

    console.log("Successfully connected to MongoDB!");

    const database = client.db("bookstore");

    booksCollection = database.collection("books");
    borrowingsCollection = database.collection("borrowings");

    app.listen(PORT, () => {
      console.log(`BookNook server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
}

startServer();
