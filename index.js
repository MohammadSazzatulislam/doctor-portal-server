const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_KEY);

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.4lwt8qz.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function veryJwt(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorization Access" });
  }
  jwt.verify(authHeader, process.env.ACCESS_TOKEN, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: "forbidden Access" });
    }
    req.decoded = decoded;
    next();
  });
}

async function run() {
  try {
    const appointmentCollection = client
      .db("doctorsPortal")
      .collection("appointmentOption");

    const bookingsCollection = client
      .db("doctorsPortal")
      .collection("bookings");

    const usersCollection = client.db("doctorsPortal").collection("users");
    const doctorsCollection = client.db("doctorsPortal").collection("doctors");
    const paymentsCollection = client
      .db("doctorsPortal")
      .collection("payments");

    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { decodedEmail };
      const user = await usersCollection.findOne(query);

      if (user?.role !== "admin") {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    app.get("/", (req, res) => {
      res.send("appi is comming soon");
    });

    app.get("/appointmentOptions", async (req, res) => {
      const date = req.query.date;
      const bookingQuery = { date: date };
      const query = {};
      const options = await appointmentCollection.find(query).toArray();
      const allreadyBooked = await bookingsCollection
        .find(bookingQuery)
        .toArray();

      options.forEach((option) => {
        const booked = allreadyBooked.filter(
          (book) => book.tretment === option.name
        );
        const bookingSlots = booked.map((book) => book.slot);
        const remainingSlots = option.slots.filter(
          (slot) => !bookingSlots.includes(slot)
        );
        option.slots = remainingSlots;
      });

      res.send(options);
    });

    app.get("/bookings", veryJwt, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const result = await bookingsCollection.findOne(filter);
      res.send(result);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      const query = {
        date: booking.date,
        email: booking.email,
        tretment: booking.tretment,
      };
      const alreadyBooked = await bookingsCollection.find(query).toArray();
      if (alreadyBooked.length) {
        return res.send({
          acknowledged: false,
          message: `you already have a booking on  ${booking.date}`,
        });
      }
      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const users = await usersCollection.findOne(query);
      if (users) {
        const token = jwt.sign({ users }, process.env.ACCESS_TOKEN, {
          expiresIn: "2d",
        });
        return res.send({ token });
      }
      res.status(403).send({ message: "forbidden access" });
    });

    app.get("/allUsers", veryJwt, verifyAdmin, async (req, res) => {
      const filter = {};
      const allUsers = await usersCollection.find(filter).toArray();
      res.send(allUsers);
    });

    app.put("/allUsers/admin/:id", veryJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const option = { upsert: true };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc, option);
      res.send(result);
    });

    // app.get('/addPrice', async(req, res)=>{
    //   const filter = {}
    //   const option = { upsert: true };
    //   const updateDoc = {
    //     $set: {
    //       price : 100 ,
    //     },
    //   };
    //   const result = await appointmentCollection.updateMany(filter, updateDoc, option);
    //   res.send(result);
    // })

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user?.role === "admin" });
    });

    app.get("/appointmentSpecialty", async (req, res) => {
      const query = {};
      const result = await appointmentCollection
        .find(query)
        .project({ name: 1 })
        .toArray();
      res.send(result);
    });

    app.post("/doctors", veryJwt, verifyAdmin, async (req, res) => {
      const doctor = req.body;
      const result = await doctorsCollection.insertOne(doctor);
      res.send(result);
    });

    app.get("/doctors", veryJwt, verifyAdmin, async (req, res) => {
      const query = {};
      const doctor = await doctorsCollection.find(query).toArray();
      res.send(doctor);
    });

    app.delete("/doctors/:id", veryJwt, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await doctorsCollection.deleteOne(query);
      res.send(result);
    });

    app.post("/create-payment-intent", async (req, res) => {
      const booking = req.body;
      const amount = booking.price * 100;

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment)
      const id = payment.bookingId;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          paid: true
        }
      }
      const bookings = await bookingsCollection.updateOne(filter, updateDoc);

      res.send(result)
    })



  } finally {
  }
}
run().catch(console.log);

app.listen(port, () => {
  console.log(`port is runnig on : ${port}`);
});
