const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;
require("dotenv").config();

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
      // const decodedEmail = req.decoded.email;

      // if (email !== decodedEmail) {
      //   return res.status(403).send({ message: "forbidden access" });
      // }
      const query = {  email : email };
      const result = await bookingsCollection.find(query).toArray();
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
      const query = { email:email };
      const users = await usersCollection.findOne(query);
      if (users) {
        const token = jwt.sign( {users} , process.env.ACCESS_TOKEN, {
          expiresIn: "2d",
        });
        return res.send({ token });
      }
      res.status(403).send({ message: "forbidden access" });
    });

    app.get("/allUsers", veryJwt, async (req, res) => {
      
      const decodedEmail = req.decoded.email
      const query = { decodedEmail };

      const user = await usersCollection.findOne(query);
      if (user?.role !== "Admin") {
        return res.status(403).send({ message: "forbidden access" });
      }

      const allUsers = await usersCollection.find(query).toArray();
      res.send(allUsers);
    });

    app.put('/allUsers/admin/:id',veryJwt, async (req, res) => {

      const decodedEmail = req.decoded.email
      const query = { email: decodedEmail }
      
      const user = await usersCollection.findOne(query)
      if (user?.role !== 'Admin') {
        return res.status(403).send({message: 'forbidden access'})
      }

      const id = req.params.id
      const filter = {_id:ObjectId(id)}
      const option = { upsert: true }
      const updateDoc = {
        $set:{
          role : 'Admin'
        }
      }
      const result = await usersCollection.updateOne(filter, updateDoc, option)
      res.send(result)
    })


    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });


    app.get('/users/admin/:email', async(req, res)=>{
      const email = req.params.email;
      const query = { email }
      const user = await usersCollection.findOne(query)
      res.send({isAdmin : user?.role === 'Admin' })
    })



  } finally {
  }
}
run().catch(console.log);

app.listen(port, () => {
  console.log(`port is runnig on : ${port}`);
});
