/**
 * Isolated mock rates. Replace getQuotes() later with Charles / X-freight.
 * One writer for quote math. No booking, no DOM.
 */
(function (global) {
  function hashZip(s) {
    var n = 0;
    var t = String(s || "").replace(/\D/g, "") || "0";
    for (var i = 0; i < t.length; i++) n = (n * 31 + t.charCodeAt(i)) % 10000;
    return n;
  }

  function mockMiles(origin, dest) {
    var a = hashZip(origin);
    var b = hashZip(dest);
    return 180 + Math.abs(a - b) % 1400;
  }

  function money(n) {
    return Math.round(n * 100) / 100;
  }

  function getQuotes(form) {
    var l = Number(form.length) || 0;
    var w = Number(form.width) || 0;
    var h = Number(form.height) || 0;
    var wt = Number(form.weight) || 0;
    var cft = (l * w * h) / 1728;
    var dimWt = cft * 10;
    var billable = Math.max(wt, dimWt, 150);
    var miles = mockMiles(form.origin, form.destination);
    var base = 185 + billable * 0.42 + miles * 0.18;
    var acc = (form.liftgate ? 75 : 0) + (form.residential ? 55 : 0);
    var list = [
      { id: "q-std", carrier: "Carrier A", service: "Standard LTL", days: 4, price: money(base + acc) },
      { id: "q-grd", carrier: "Carrier B", service: "Guaranteed", days: 3, price: money(base * 1.18 + acc + 40) },
      { id: "q-eco", carrier: "Carrier C", service: "Economy", days: 6, price: money(base * 0.88 + acc) },
      { id: "q-exp", carrier: "Carrier D", service: "Expedite", days: 2, price: money(base * 1.35 + acc + 80) }
    ];
    var cheapest = list.reduce(function (a, b) { return a.price <= b.price ? a : b; });
    var shortest = list.reduce(function (a, b) { return a.days <= b.days ? a : b; });
    var reliable = list.filter(function (q) { return q.service === "Guaranteed"; })[0] || list[0];
    cheapest.label = "cheapest";
    if (reliable !== cheapest) reliable.label = "most reliable";
    else reliable.label = "cheapest / most reliable";
    if (shortest !== cheapest && shortest !== reliable) shortest.label = "shortest";
    else if (!shortest.label) shortest.label = "shortest";
    return { mocked: true, billable: money(billable), miles: miles, quotes: list };
  }

  global.FreightQuotes = { getQuotes: getQuotes };
})(window);
