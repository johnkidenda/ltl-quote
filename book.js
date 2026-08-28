/**
 * Isolated book log. One writer for booked rows.
 * Columns match the Freight quote bookings Sheet, plus journey fields.
 * Extra detail also lands in notes. No quote math, no payments.
 * Static page cannot write Google Sheets.
 */
(function (global) {
  var KEY = "ltl_bookings";

  function csvEscape(v) {
    var s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function yn(v) {
    if (v === true || v === "yes" || v === "true") return "yes";
    if (v === false || v === "no" || v === "false" || v == null || v === "") return "no";
    return String(v);
  }

  function firstItem(form) {
    if (form && form.items && form.items.length) return form.items[0];
    return form || {};
  }

  function itemDims(form) {
    var it = firstItem(form);
    return {
      length: it.length != null ? it.length : form.length,
      width: it.width != null ? it.width : form.width,
      height: it.height != null ? it.height : form.height,
      weight: it.weight != null ? it.weight : form.weight,
      qty: it.qty != null ? it.qty : (it.quantity != null ? it.quantity : form.quantity),
      description: it.description || form.commodity || "",
      freightType: it.freightType || form.freightType || ""
    };
  }

  function accessorialList(form) {
    if (form.accessorialsList && form.accessorialsList.length) {
      return form.accessorialsList.slice();
    }
    var keys = [];
    var acc = form.accessorials || {};
    function push(list) {
      (list || []).forEach(function (k) {
        if (k && keys.indexOf(k) < 0) keys.push(k);
      });
    }
    if (Array.isArray(acc)) push(acc);
    else {
      push(acc.pickup);
      push(acc.delivery);
      push(acc.general);
    }
    if (form.liftgate && keys.indexOf("liftgate") < 0) keys.push("liftgate");
    if (form.residential && keys.indexOf("residential") < 0) keys.push("residential");
    return keys;
  }

  function hasAccessorial(form, key) {
    return accessorialList(form).indexOf(key) >= 0 || !!form[key];
  }

  function formatAddress(block) {
    if (!block) return "";
    if (typeof block === "string") return block;
    return [block.name, block.street, block.city, block.region, block.postal, block.country]
      .filter(Boolean)
      .join(", ");
  }

  function formatContact(block) {
    if (!block) return "";
    var name = block.contact || block.contactName || "";
    var phone = block.phone || block.contactPhone || "";
    var hours = "";
    if (block.hoursFrom || block.hoursTo) {
      hours = (block.hoursFrom || "") + "–" + (block.hoursTo || "");
    }
    return [name, phone, hours].filter(Boolean).join(" · ");
  }

  function headers() {
    return [
      "booked_at", "label", "carrier", "price_usd", "transit_days",
      "origin", "destination", "length_in", "width_in", "height_in",
      "weight_lb", "liftgate", "residential", "notes",
      "commodity", "quantity", "pieces", "freight_type", "accessorials",
      "mode", "door_service", "route_id",
      "pickup_address", "delivery_address", "pickup_contact", "delivery_contact",
      "customs_hs", "customs_value", "estimated_duty", "terms_accepted"
    ];
  }

  function toRow(form, quote) {
    form = form || {};
    quote = quote || {};
    var dims = itemDims(form);
    var acc = accessorialList(form);
    var pieces = form.pieces != null ? form.pieces : dims.qty;
    var customs = form.customs || {};
    var noteParts = [
      quote.service || "",
      quote.mode || "",
      quote.doorService || form.doorService || "",
      quote.id || "",
      "mocked"
    ];
    if (form.items && form.items.length > 1) {
      noteParts.push(form.items.length + " line items");
    }
    if (acc.length) noteParts.push("accessorials: " + acc.join("|"));
    if (customs.hs) noteParts.push("HS " + customs.hs);
    if (form.notes) noteParts.push(form.notes);

    return {
      booked_at: new Date().toISOString(),
      label: quote.label || "",
      carrier: quote.carrier || "",
      price_usd: quote.price,
      transit_days: quote.days,
      origin: form.origin || "",
      destination: form.destination || "",
      length_in: dims.length,
      width_in: dims.width,
      height_in: dims.height,
      weight_lb: dims.weight,
      liftgate: yn(hasAccessorial(form, "liftgate")),
      residential: yn(hasAccessorial(form, "residential")),
      notes: noteParts.filter(Boolean).join(" · "),
      commodity: dims.description,
      quantity: dims.qty != null ? dims.qty : "",
      pieces: pieces != null ? pieces : "",
      freight_type: dims.freightType,
      accessorials: acc.join("|"),
      mode: quote.mode || "",
      door_service: quote.doorService || form.doorService || "",
      route_id: quote.id || "",
      pickup_address: formatAddress(form.pickup),
      delivery_address: formatAddress(form.delivery),
      pickup_contact: formatContact(form.pickup),
      delivery_contact: formatContact(form.delivery),
      customs_hs: customs.hs || "",
      customs_value: customs.value != null ? customs.value : "",
      estimated_duty: customs.estimatedDuty != null ? customs.estimatedDuty : "",
      terms_accepted: yn(form.termsAccepted)
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

  var api = { bookQuote: bookQuote, all: all, toCsv: toCsv, headers: headers, toRow: toRow };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.FreightBook = api;
})(typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : this);
