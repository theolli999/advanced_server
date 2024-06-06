import express from "express";
import cors from "cors";
import passport from "passport";
import dotenv from 'dotenv';
dotenv.config();
import { Strategy as SpotifyStrategy } from 'passport-spotify';
import helloRoute from "./routes/helloRouter.js";
import session from 'express-session';
import pkg from 'pg';
import failureFlash from 'connect-flash';
const { Pool } = pkg;
const app = express();

// Create a new pool with your database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// parse json request body
app.use(express.json());

// enable cors
app.use(cors({
  origin: 'https://frontend-production-cae1.up.railway.app/', // ersätt med din frontend-domän
  methods: ['GET', 'POST'], // de metoder du vill tillåta
  credentials: true, // tillåt att cookies skickas
  allowedHeaders: ['Content-Type', 'Authorization'] // de headers du vill tillåta
}));

// request logger middleware
//app.use(morgan("tiny"));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // ändra till false om du inte använder HTTPS
}));

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, done) {
  process.nextTick(function() {
    return done(null, user.id);
  });
});

passport.deserializeUser(function(id, done) {
  const query = 'SELECT * FROM users WHERE id = $1';
  console.log("deserializeUser:", id);
  pool.query(query, [id], (error, results) => {
    if (error) {
      console.log(error.stack)
      return done(error);
    } else {
      console.log("deserializeUser:", results.rows[0]);
      return done(null, results.rows[0]);
    }
  });
});
passport.use(
  new SpotifyStrategy(
    {
      clientID: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      callbackURL: "https://advancedserver-production.up.railway.app/auth/spotify/callback",
      scope: ['user-top-read', 'app-remote-control', 'user-modify-playback-state']
    },
    (accessToken, refreshToken, expires_in, profile, done) => {

      const query = `
        INSERT INTO users (id, display_name, access_token, refresh_token, expires_in) 
        VALUES ($1, $2, $3, $4, $5) 
        ON CONFLICT (id) 
        DO UPDATE SET access_token = $3, refresh_token = $4, expires_in = $5
      `;

      const values = [parseInt(profile.id), profile.displayName, accessToken, refreshToken, expires_in];

      pool.query(query, values, (error, results) => {
        if (error) {
          console.error('Database error:', error);
        } else {
          console.log('Insert successful:', results);
        }
        return done(null, profile);
      });
    }
  )
);



app.get("/login/spotify", passport.authenticate("spotify"));

app.get("/auth/spotify/callback",
  passport.authenticate("spotify", { failureRedirect: "/login", failureMessage: true }),
  function(req, res) {
    // Användaren har framgångsrikt autentiserats och omdirigerats hit.
    // req.user innehåller användarinformationen.
    res.redirect(process.env.FRONTEND + "play");
  }
);

// healthcheck endpointF
app.get("/", (req, res) => {
  console.log("GET /");
  res.status(200).send({ status: "ok" });
});

app.get('/users/name', (req, res) => {
  console.log("user is: ", req.user)
  const name = req.user.display_name;
  res.status(200).json(name);
});

app.get('/users/token', (req, res) => {
  console.log(req.user)
  const token = req.user.access_token;
  res.status(200).json(token);
});

app.use("/hello", helloRoute);

// custom middleware
app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});
export default app;
