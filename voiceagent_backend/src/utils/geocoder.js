const fetch = require("node-fetch");

// Converts a plain address string to {lat, lng, address, city, state, country}
const geocode = async (addressStr) => {
  const encoded = encodeURIComponent(addressStr + ", Canada");
  const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1&countrycodes=ca,us`;

  const res = await fetch(url, {
    headers: { "User-Agent": "HopnTravelBot/1.0" },
  });

  const data = await res.json();

  if (!data || data.length === 0) {
    // Fallback — return address as-is with Toronto center coords
    return {
      lat:     43.6532,
      lng:     -79.3832,
      address: addressStr,
      city:    "Toronto",
      state:   "Ontario",
      country: "Canada",
    };
  }

  const result  = data[0];
  const display = result.display_name || addressStr;
  const parts   = display.split(", ");

  return {
    lat:     parseFloat(result.lat),
    lng:     parseFloat(result.lon),
    address: parts[0] || addressStr,
    city:    parts[1] || "Toronto",
    state:   parts[parts.length - 3] || "Ontario",
    country: parts[parts.length - 1] || "Canada",
  };
};

module.exports = { geocode };
