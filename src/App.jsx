
import { useEffect, useState } from "react";
import PrivateVault from "./PrivateVault";
import "./App.css";

const watches = [
  { id: 1, brand: "ROLEX", name: "Submariner Date", price: "₹12,50,000", type: "analog", skin: "green" },
  { id: 2, brand: "TITAN", name: "Octane Classic", price: "₹18,995", type: "analog", skin: "black" },
  { id: 3, brand: "CASIO", name: "G-Shock Digital", price: "₹8,495", type: "digital", skin: "digital" },
  { id: 4, brand: "OMEGA", name: "Seamaster Diver", price: "₹5,85,000", type: "analog", skin: "blue" },
  { id: 5, brand: "TIMEVAULT", name: "Emerald Heritage", price: "₹24,999", type: "analog", skin: "green" },
  { id: 6, brand: "CASIO", name: "Vintage Digital", price: "₹3,495", type: "digital", skin: "vintage" },
  { id: 7, brand: "TITAN", name: "Goldline Automatic", price: "₹32,995", type: "analog", skin: "gold" },
  { id: 8, brand: "TIMEVAULT", name: "Midnight Classic", price: "₹14,999", type: "analog", skin: "black" },
];

function now() {
  const d = new Date();

  return {
    h: d.getHours() % 12,
    m: d.getMinutes(),
    s: d.getSeconds(),
    text: d.toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }),
  };
}

function Dial({ p }) {
  const [t, setT] = useState(now);

  useEffect(() => {
    const id = setInterval(() => setT(now()), 250);
    return () => clearInterval(id);
  }, []);

  if (p.type === "digital") {
    return (
      <div className={"digital " + p.skin}>
        <small>{p.brand}</small>
        <b>{t.text}</b>
        <small>LIVE · IST</small>
      </div>
    );
  }

  return (
    <div className={"dial " + p.skin}>
      {Array.from({ length: 60 }, (_, i) => (
        <i
          key={i}
          className={i % 5 === 0 ? "tick major" : "tick"}
          style={{
            transform: `translateX(-50%) rotate(${i * 6}deg)`,
          }}
        />
      ))}

      {Array.from({ length: 12 }, (_, i) => (
        <span
          className="num"
          key={i}
          style={{
            transform: `translate(-50%,-50%) rotate(${i * 30}deg) translateY(-38px) rotate(${-i * 30}deg)`,
          }}
        >
          {i || 12}
        </span>
      ))}

      <b className="dialbrand">{p.brand}</b>
      <span className="subbrand">AUTOMATIC</span>

      <i
        className="hand hour"
        style={{
          transform: `translateX(-50%) rotate(${(t.h + t.m / 60) * 30}deg)`,
        }}
      />

      <i
        className="hand minute"
        style={{
          transform: `translateX(-50%) rotate(${(t.m + t.s / 60) * 6}deg)`,
        }}
      />

      <i
        className="hand second"
        style={{
          transform: `translateX(-50%) rotate(${t.s * 6}deg)`,
        }}
      />

      <i className="pin" />
    </div>
  );
}

function Watch({ p, hero = false }) {
  return (
    <div className={"watch " + (hero ? "hero-watch " : "") + p.skin}>
      <div className="strap top" />
      <div className="case">
        <Dial p={p} />
        <i className="crown" />
      </div>
      <div className="strap bottom" />
    </div>
  );
}

export default function App() {
  const [vaultOpen, setVaultOpen] = useState(false);

  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [detail, setDetail] = useState(null);
  const [time, setTime] = useState(now);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const id = setInterval(() => setTime(now()), 250);
    return () => clearInterval(id);
  }, []);

  const shown = watches.filter(
    (p) =>
      (filter === "ALL" || p.brand === filter) &&
      `${p.brand} ${p.name}`.toLowerCase().includes(search.toLowerCase())
  );

  function add(p) {
    setCart((c) => [...c, p]);
    setToast(p.name + " added to your bag");
    setTimeout(() => setToast(""), 2000);
  }

  // Open the separate Private Vault without changing the homepage.
  if (vaultOpen) {
    return <PrivateVault onClose={() => setVaultOpen(false)} />;
  }

  return (
    <div className="app">
      <header className="nav">
        <a className="logo" href="#home">
          <strong>♛</strong>
          <span>
            TIMEVAULT
            <small>LUXURY WATCHES</small>
          </span>
        </a>

        <nav>
          <a href="#home">Home</a>
          <a href="#brands">Brands</a>
          <a href="#collections">Collections</a>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </nav>

        <div className="icons">
          <a href="#collections">⌕</a>
          <a href="#collections">♡</a>
          <button
            onClick={() =>
              setToast(`Your bag contains ${cart.length} item(s).`)
            }
          >
            ♧{cart.length > 0 && <sup>{cart.length}</sup>}
          </button>
          <button
            type="button"
            aria-label="Open Private Vault"
            onClick={() => setVaultOpen(true)}
          >
            ◎
          </button>
        </div>
      </header>

      <section className="hero" id="home">
        <div className="copy">
          <p className="eyebrow">
            ICONIC BRANDS <span>×</span> REAL TIME
          </p>

          <h1>
            More Than
            <br />
            Just Time
          </h1>

          <p className="desc">
            Luxury watches from the world's most
            <br />
            prestigious brands — with live time, always.
          </p>

          <a className="cta" href="#collections">
            EXPLORE COLLECTION <b>→</b>
          </a>

          <div className="brands" id="brands">
            {watches.slice(0, 4).map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setFilter(p.brand);
                  document
                    .querySelector("#collections")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <Watch p={p} />
                <b>{p.brand}</b>
              </button>
            ))}
            <a href="#collections">→</a>
          </div>
        </div>

        <div className="hero-stage">
          <div className="stone" />
          <Watch p={watches[0]} hero />
          <div className="hero-caption">
            THE ICON
            <br />
            <b>Submariner Date</b>
          </div>
        </div>

        <div className="live top-live">
          <span>◷</span>
          <div>
            <small>LIVE TIME</small>
            <b>{time.text}</b>
            <em>India Standard Time</em>
          </div>
        </div>

        <div className="live-pill">
          <span>◷</span>
          <div>
            <b>LIVE TIME</b>
            <small>
              Every watch shows
              <br />
              the current time
            </small>
          </div>
        </div>
      </section>

      <section className="trust">
        {[
          ["♧", "100% Authentic", "Original products. Guaranteed."],
          ["♧", "Worldwide Shipping", "Luxury delivered globally."],
          ["▤", "Secure Payments", "Safe. Simple. Trusted."],
          ["♧", "24/7 Support", "We're always here."],
        ].map((x) => (
          <div key={x[1]}>
            <i>{x[0]}</i>
            <p>
              <b>{x[1]}</b>
              <small>{x[2]}</small>
            </p>
          </div>
        ))}
      </section>

      <section className="collection" id="collections">
        <div className="heading">
          <p className="eyebrow">CURATED FOR YOU</p>
          <h2>Discover the Collection</h2>
          <p>Every second, beautifully accounted for.</p>
        </div>

        <div className="tools">
          <div>
            {["ALL", "ROLEX", "TITAN", "CASIO", "OMEGA", "TIMEVAULT"].map(
              (x) => (
                <button
                  className={filter === x ? "selected" : ""}
                  onClick={() => setFilter(x)}
                  key={x}
                >
                  {x}
                </button>
              )
            )}
          </div>

          <input
            placeholder="Search watches..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="grid">
          {shown.map((p) => (
            <article className="card" key={p.id}>
              <button
                className="heart"
                onClick={() => setToast(p.name + " saved to wishlist")}
              >
                ♡
              </button>

              <button
                className="product-visual"
                onClick={() => setDetail(p)}
              >
                <Watch p={p} />
              </button>

              <small>{p.brand}</small>
              <h3>{p.name}</h3>

              <div className="buy">
                <b>{p.price}</b>
                <button onClick={() => add(p)}>ADD +</button>
              </div>

              <p className="live-label">● LIVE DIAL · IST</p>
            </article>
          ))}
        </div>
      </section>

      <section className="manifesto" id="about">
        <p className="eyebrow">TIMEVAULT PHILOSOPHY</p>
        <h2>
          More Than a Watch.
          <br />
          <i>A Part of Your Story.</i>
        </h2>
        <p>Crafted to mark moments. Chosen to last beyond them.</p>
      </section>

      {/* PRIVATE VAULT PROMOTIONAL SECTION */}
      <section className="private-vault-section" id="private-vault">
        <div className="private-vault-copy">
          <p className="private-vault-eyebrow">
            THE TIMEVAULT PRIVATE EXPERIENCE
          </p>

          <h2>
            Some Collections
            <br />
            Are Personal.
          </h2>

          <p className="private-vault-description">
            An intimate space for the timepieces you treasure,
            the stories they carry, and the moments that define
            your collection.
          </p>

          <div className="private-vault-access">
            <span>♛</span>
            RESERVED FOR INVITED COLLECTORS
          </div>

          <button
            className="private-vault-button"
            onClick={() => setVaultOpen(true)}
          >
            OPEN YOUR PRIVATE VAULT <span>→</span>
          </button>

          <p className="private-vault-note">
            Exclusive access. A collection that is entirely yours.
          </p>
        </div>

        <div className="private-vault-image">
          <img
            src="/private-vault-box.png"
            alt="TIMEVAULT emerald green luxury watch presentation box"
          />
        </div>

        <div className="private-vault-bottom-mark" aria-hidden="true">
          ✦
        </div>
      </section>

      <section className="newsletter" id="contact">
        <div>
          <p className="eyebrow">THE TIMEVAULT LETTER</p>
          <h2>Good taste takes time.</h2>
          <p>New arrivals, considered stories, and timeless inspiration.</p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setToast("Thanks for joining TIMEVAULT.");
          }}
        >
          <input
            type="email"
            placeholder="Your email address"
            required
          />
          <button>JOIN THE LIST →</button>
        </form>
      </section>

      <footer>
        <b>♛ TIMEVAULT</b>
        <span>TIMELESS DESIGN. EVERY SECOND.</span>
        <small>© 2026 TIMEVAULT</small>
      </footer>

      {detail && (
        <div className="overlay" onClick={() => setDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setDetail(null)}>
              ×
            </button>

            <Watch p={detail} hero />

            <div>
              <p className="eyebrow">{detail.brand} · LIVE DIAL</p>
              <h2>{detail.name}</h2>
              <h3>{detail.price}</h3>
              <p>
                Live dial preview synchronized to India Standard Time.
              </p>
              <button className="goldbtn" onClick={() => add(detail)}>
                ADD TO BAG
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
