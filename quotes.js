/**
 * Isolated mock rates. Replace getQuotes() later with Charles / X-freight.
 * One writer for quote math. No booking, no DOM.
 *
 * getQuotes returns air + ocean options labeled cheapest / fastest /
 * most reliable / shortest. Door-to-door vs door-to-port changes price
 * and dest labeling only — still mocked.
 */
(function (global) {
  var LB_PER_KG = 2.20462262;
  var IN3_PER_CFT = 1728;
  var CFT_PER_M3 = 35.3147;
  var DIM_LB_PER_CFT = 10.4;
  var LINEAR_CFT_PER_FT = 160 / 12;

  function money(n) {
    return Math.round(n * 100) / 100;
  }

  function hashStr(s) {
    var n = 0;
    var t = String(s || "");
    for (var i = 0; i < t.length; i++) n = (n * 31 + t.charCodeAt(i)) % 10000;
    return n;
  }

  function hashZip(s) {
    var digits = String(s || "").replace(/\D/g, "");
    if (!digits) return hashStr(s);
    var n = 0;
    for (var i = 0; i < digits.length; i++) n = (n * 31 + digits.charCodeAt(i)) % 10000;
    return n;
  }

  function toInches(value, unit) {
    var n = Number(value) || 0;
    return String(unit || "in").toLowerCase() === "cm" ? n / 2.54 : n;
  }

  function toLb(value, unit) {
    var n = Number(value) || 0;
    return String(unit || "lb").toLowerCase() === "kg" ? n * LB_PER_KG : n;
  }

  function countryCode(value) {
    var c = String(value || "").trim().toUpperCase();
    if (!c) return "";
    if (c === "USA" || c === "UNITED STATES" || c === "UNITED STATES OF AMERICA") return "US";
    if (c === "BRAZIL") return "BR";
    if (c === "CANADA") return "CA";
    if (c === "MEXICO") return "MX";
    if (c === "UNITED KINGDOM" || c === "GREAT BRITAIN" || c === "ENGLAND") return "GB";
    if (c === "GERMANY") return "DE";
    return c.length === 2 ? c : c;
  }

  function isUsCountry(value) {
    var c = countryCode(value);
    return c === "US";
  }

  function normalizeItems(form) {
    form = form || {};
    if (form.items && form.items.length) {
      return form.items.map(function (it) {
        return {
          description: it.description || it.commodity || "",
          freightType: it.freightType || "General",
          qty: Number(it.qty != null ? it.qty : it.quantity) || 1,
          length: toInches(it.length, it.dimUnit),
          width: toInches(it.width, it.dimUnit),
          height: toInches(it.height, it.dimUnit),
          weight: toLb(it.weight, it.weightUnit)
        };
      });
    }
    return [{
      description: form.commodity || "",
      freightType: form.freightType || "General",
      qty: Number(form.quantity) || 1,
      length: Number(form.length) || 0,
      width: Number(form.width) || 0,
      height: Number(form.height) || 0,
      weight: Number(form.weight) || 0
    }];
  }

  function summarizeShipment(form) {
    var items = normalizeItems(form);
    var actual = 0;
    var cft = 0;
    var pieces = 0;
    items.forEach(function (it) {
      var qty = Math.max(1, it.qty || 1);
      pieces += qty;
      actual += it.weight;
      cft += (it.length * it.width * it.height * qty) / IN3_PER_CFT;
    });
    var dim = cft * DIM_LB_PER_CFT;
    var billable = Math.max(actual, dim, 150);
    return {
      items: items,
      pieces: pieces,
      actualWeight: money(actual),
      dimWeight: money(dim),
      billable: money(billable),
      actualKg: money(actual / LB_PER_KG),
      dimKg: money(dim / LB_PER_KG),
      volumeCft: money(cft),
      volumeM3: money(cft / CFT_PER_M3),
      linearFeet: money(cft / LINEAR_CFT_PER_FT)
    };
  }

  function mockMiles(origin, dest) {
    var a = hashZip(origin);
    var b = hashZip(dest);
    return 180 + Math.abs(a - b) % 1400;
  }

  function accessorialKeys(form) {
    var acc = (form && form.accessorials) || {};
    var keys = [];
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
    if (form && form.liftgate && keys.indexOf("liftgate") < 0) keys.push("liftgate");
    if (form && form.residential && keys.indexOf("residential") < 0) keys.push("residential");
    return keys;
  }

  var ACCESSORIAL_FEES = {
    liftgate: 75,
    residential: 55,
    construction: 90,
    hotel: 65,
    inside: 85,
    "limited-access": 70,
    school: 60,
    "appointment-pickup": 45,
    "appointment-delivery": 45,
    notification: 15,
    "sort-segment": 120,
    fba: 40,
    "trade-show": 85,
    alcohol: 110,
    tarps: 40,
    fragile: 80,
    hazardous: 150,
    "in-bond": 75,
    freeze: 95,
    unpalletized: 50
  };

  function accessorialFee(form) {
    return accessorialKeys(form).reduce(function (sum, k) {
      return sum + (ACCESSORIAL_FEES[k] || 25);
    }, 0);
  }

  function isInternational(form) {
    form = form || {};
    var destCountry = form.destCountry || form.destinationCountry || "";
    if (destCountry) return !isUsCountry(destCountry);
    var dest = String(form.destination || "").trim();
    if (/^\d{5}(-\d{4})?$/.test(dest)) return false;
    if (/\bunited states\b|\bUSA\b/i.test(dest)) return false;
    if (/,?\s*US\s*$/i.test(dest)) return false;
    if (/\b(brazil|canada|mexico|germany|france|china|japan|uk|united kingdom|rio)\b/i.test(dest)) {
      return true;
    }
    return false;
  }

  function freightClassLabel(form) {
    if (isInternational(form)) return "Auto-assigned on international shipment";
    var sum = summarizeShipment(form);
    var density = sum.actualWeight / Math.max(sum.volumeCft, 0.1);
    if (density >= 15) return "70";
    if (density >= 10) return "85";
    if (density >= 6) return "125";
    return "250";
  }

  function suggestCommodity(description) {
    var d = String(description || "");
    var catalog = [
      { re: /kumquat|citrus|bergamot|citron/i, hs: "0805502010", name: "Citrus fruits, fresh or dried, including kumquats, citrons, bergamots and other" },
      { re: /coffee/i, hs: "0901110000", name: "Coffee, not roasted, not decaffeinated" },
      { re: /auto part|spare part/i, hs: "8708990000", name: "Motor vehicle parts and accessories" },
      { re: /apparel|garment|clothing/i, hs: "6204620000", name: "Women's or girls' trousers, of cotton" },
      { re: /machine|pump|motor/i, hs: "8413810000", name: "Pumps for liquids" }
    ];
    for (var i = 0; i < catalog.length; i++) {
      if (catalog[i].re.test(d)) return { hs: catalog[i].hs, name: catalog[i].name };
    }
    return { hs: "2106900000", name: "Food preparations, not elsewhere specified" };
  }

  function addDays(isoDate, days) {
    var base = isoDate || new Date().toISOString().slice(0, 10);
    var d = new Date(base + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function formatDeliver(iso) {
    var d = new Date(iso + "T12:00:00Z");
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return months[d.getUTCMonth()] + " " + String(d.getUTCDate()).padStart(2, "0");
  }

  function destCode(form, mode) {
    var c = countryCode(form.destCountry || "");
    var dest = String(form.destination || "").toUpperCase();
    if (c === "BR" || /RIO|BRAZIL|SANTOS/.test(dest)) return mode === "air" ? "GIG" : "SSZ";
    if (c === "CA") return mode === "air" ? "YYZ" : "YHZ";
    if (c === "MX") return mode === "air" ? "MEX" : "VER";
    if (c === "GB") return mode === "air" ? "LHR" : "FXT";
    if (c === "DE") return mode === "air" ? "FRA" : "HAM";
    return mode === "air" ? "EWR" : "NYC";
  }

  function originCode(form, mode) {
    var origin = String(form.origin || "").toUpperCase();
    if (/CHICAGO|ORD|606/.test(origin)) return mode === "air" ? "ORD" : "CHI";
    if (/NEW YORK|NYC|10001/.test(origin)) return mode === "air" ? "JFK" : "NYC";
    return mode === "air" ? "ORD" : "CHI";
  }

  function destPlaceLabel(form, doorService) {
    var dest = String(form.destination || "").split(",")[0] || "Destination";
    if (doorService === "door-to-port") {
      var c = countryCode(form.destCountry || "");
      if (c === "BR") return "Santos / Galeão";
      return dest + " port";
    }
    return dest;
  }

  function estimateDuties(form) {
    form = form || {};
    if (!isInternational(form)) {
      return {
        international: false,
        currency: "USD",
        value: 0,
        dutyRate: 0,
        taxRate: 0,
        duty: 0,
        tax: 0,
        antiDumping: 0,
        merchandiseProcessing: 0,
        harborMaintenance: 0,
        total: 0,
        note: "Domestic destination — no customs estimate."
      };
    }
    var value = Number(form.customsValue || form.lineValue || 0);
    if (!value) {
      var sum = summarizeShipment(form);
      value = Math.max(100, money(sum.actualWeight * 0.2));
    }
    var dest = countryCode(form.destCountry || "");
    var dutyRate = dest === "BR" ? 0.6167 : 0.12;
    var taxRate = dest === "BR" ? 0.3858 : 0.05;
    var duty = money(value * dutyRate);
    var tax = money(value * taxRate);
    return {
      international: true,
      currency: "USD",
      value: money(value),
      dutyRate: dutyRate,
      taxRate: taxRate,
      duty: duty,
      tax: tax,
      antiDumping: 0,
      merchandiseProcessing: 0,
      harborMaintenance: 0,
      total: money(duty + tax),
      note: "Mock estimate. Not a customs filing."
    };
  }

  function getQuotes(form) {
    form = form || {};
    var sum = summarizeShipment(form);
    var origin = form.origin || "";
    var dest = form.destination || "";
    var miles = mockMiles(origin, dest);
    var acc = accessorialFee(form);
    var door = form.doorService === "door-to-port" ? "door-to-port" : "door-to-door";
    var doorMult = door === "door-to-port" ? 0.86 : 1;
    var international = isInternational(form);
    var shipDate = form.shipDate || new Date().toISOString().slice(0, 10);
    var destLabel = destPlaceLabel(form, door);
    var originLabel = String(origin).split(",")[0] || "Origin";
    var truckBase = door === "door-to-port" ? Math.round(miles * 0.12) : Math.round(miles * 0.22);

    var airBase = money((820 + sum.billable * 0.85 + miles * 0.32) * doorMult + acc);
    var oceanBase = money((420 + sum.billable * 0.52 + miles * 0.16) * doorMult + acc);

    var airDays = international ? { cheap: 11, fast: 8 } : { cheap: 3, fast: 1 };
    var oceanDays = international ? { cheap: 34, fast: 29 } : { cheap: 12, fast: 9 };
    if (door === "door-to-port") {
      airDays = { cheap: airDays.cheap + 7, fast: airDays.fast };
      oceanDays = { cheap: oceanDays.cheap, fast: oceanDays.fast };
    }

    var templates = [
      { id: "air-cheap", mode: "air", carrier: "Skyline Air", label: "cheapest", days: airDays.cheap, priceMult: 1, truck: 0 },
      { id: "air-fast", mode: "air", carrier: "Northwind Express", label: "fastest", days: airDays.fast, priceMult: 1.68, truck: 0 },
      { id: "air-rel", mode: "air", carrier: "Harbor Air", label: "most reliable", days: airDays.cheap, priceMult: 1, truck: 0 },
      { id: "air-short", mode: "air", carrier: "Skyline Air", label: "shortest", days: airDays.cheap, priceMult: 1, truck: 0 },
      { id: "ocn-cheap", mode: "ocean", carrier: "Bluewater Line", label: "cheapest", days: oceanDays.cheap, priceMult: 1, truck: truckBase },
      { id: "ocn-fast", mode: "ocean", carrier: "Atlantic Loop", label: "fastest", days: oceanDays.fast, priceMult: 2, truck: Math.round(truckBase * 3.7) },
      { id: "ocn-rel", mode: "ocean", carrier: "Harbor Marine", label: "most reliable", days: oceanDays.cheap, priceMult: 1, truck: truckBase },
      { id: "ocn-short", mode: "ocean", carrier: "Bluewater Line", label: "shortest", days: oceanDays.cheap, priceMult: 1, truck: truckBase }
    ];

    var quotes = templates.map(function (row) {
      var days = Math.max(1, row.days);
      var deliver = addDays(shipDate, days);
      var base = row.mode === "air" ? airBase : oceanBase;
      return {
        id: row.id + (door === "door-to-port" ? "-port" : "-door"),
        mode: row.mode,
        carrier: row.carrier,
        service: row.mode === "air" ? "Air Freight" : "Ocean Freight",
        label: row.label,
        days: days,
        price: money(base * row.priceMult),
        originHub: originCode(form, row.mode),
        destHub: destCode(form, row.mode),
        truckMiles: row.truck,
        shipDate: shipDate,
        deliverDate: deliver,
        deliverLabel: formatDeliver(deliver),
        doorService: door,
        originLabel: originLabel,
        destLabel: destLabel,
        via: originLabel + " → " + destLabel + " · " + row.carrier
      };
    });

    return {
      mocked: true,
      billable: sum.billable,
      actualWeight: sum.actualWeight,
      dimWeight: sum.dimWeight,
      actualKg: sum.actualKg,
      dimKg: sum.dimKg,
      pieces: sum.pieces,
      volumeCft: sum.volumeCft,
      volumeM3: sum.volumeM3,
      linearFeet: sum.linearFeet,
      miles: miles,
      international: international,
      doorService: door,
      freightClass: freightClassLabel(form),
      quotes: quotes,
      duties: estimateDuties(form)
    };
  }

  var api = {
    getQuotes: getQuotes,
    summarizeShipment: summarizeShipment,
    isInternational: isInternational,
    estimateDuties: estimateDuties,
    suggestCommodity: suggestCommodity,
    freightClassLabel: freightClassLabel,
    accessorialKeys: accessorialKeys
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.FreightQuotes = api;
})(typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : this);
