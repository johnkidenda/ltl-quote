/**
 * Isolated book log. One writer for booked rows.
 * No quote math, no payments. Static page cannot write Google Sheets.
 */
(function (global) {
  var KEY = "ltl_bookings";

  function csvEscape(v) {
    var s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function headers() {
    return [
      "booked_at", "origin", "destination", "length_in", "width_in", "height_in",
      "weight_lb", "liftgate", "residential", "quote_id", "carrier", "service",
      "transit_days", "price", "mocked"
    ];
  }

  function toRow(form, quote) {
    return {
      booked_at: new Date().toISOString(),
      origin: form.origin,
      destination: form.destination,
      length_in: form.length,
      width_in: form.width,
      height_in: form.height,
      weight_lb: form.weight,
      liftgate: form.liftgate ? "yes" : "no",
      residential: form.residential ? "yes" : "no",
      quote_id: quote.id,
      carrier: quote.carrier,
      service: quote.service,
      transit_days: quote.days,
      price: quote.price,
      mocked: true
    };
  }

  function all() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch (e) {
      return [];
    }
  }

  function toCsv(rows) {
    var cols = headers();
    var lines = [cols.join(",")];
    rows.forEach(function (r) {
      lines.push(cols.map(function (c) { return csvEscape(r[c]); }).join(","));
    });
    return lines.join("\n") + "\n";
  }

  function downloadCsv(rows) {
    var blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ltl-bookings.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function bookQuote(form, quote) {
    var row = toRow(form, quote);
    var rows = all();
    rows.push(row);
    localStorage.setItem(KEY, JSON.stringify(rows));
    downloadCsv(rows);
    return row;
  }

  global.FreightBook = { bookQuote: bookQuote, all: all, toCsv: toCsv, headers: headers };
})(window);
