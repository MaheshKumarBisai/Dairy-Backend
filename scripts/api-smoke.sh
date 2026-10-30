#!/usr/bin/env bash
# End-to-end smoke of every endpoint the DairyFresh frontends call.
#
# Requires the backend on http://localhost:4000 (override with DAIRY_API).
# Creates one test order and one temporary address (both cleaned up below),
# and restores the profile/availability state it touches, so it is safe to
# re-run alongside `npm test` / `npm run test:e2e`.
set -u
BASE="${DAIRY_API:-http://localhost:4000/api/v1}"
pass=0; fail=0
ok()   { pass=$((pass+1)); echo "  ok   $1"; }
bad()  { fail=$((fail+1)); echo "  FAIL $1 -> ${2:0:200}"; }

jsonpath() { jq -r "$1" 2>/dev/null; }

call() { # method path token body -> body
  local method=$1 path=$2 token=$3 body=${4:-}
  if [ -n "$body" ]; then
    curl -s -m 10 -X "$method" "$BASE$path" -H 'Content-Type: application/json' \
      ${token:+-H "Authorization: Bearer $token"} -d "$body"
  else
    curl -s -m 10 -X "$method" "$BASE$path" ${token:+-H "Authorization: Bearer $token"}
  fi
}

echo "== customer auth =="
CRES=$(call POST /auth/login "" '{"email":"customer@example.com","password":"Password@123"}')
CTOK=$(echo "$CRES" | jsonpath '.data.accessToken')
[ -n "$CTOK" ] && [ "$CTOK" != "null" ] && ok "customer login" || bad "customer login" "$CRES"
CME=$(call GET /users/me "$CTOK")
CROLE=$(echo "$CME" | jsonpath '.data.role')
[ "$CROLE" = "CUSTOMER" ] && ok "users/me role=$CROLE" || bad "users/me role" "$CME"
CNAME=$(echo "$CME" | jsonpath '.data.name')
CPHONE=$(echo "$CME" | jsonpath '.data.phone')

echo "== catalog =="
PRODS=$(call GET "/products?limit=5" "")
N=$(echo "$PRODS" | jsonpath '.data.products | length')
[ "${N:-0}" -gt 0 ] && ok "products ($N)" || bad "products" "$PRODS"
CATS=$(call GET /categories "")
CN=$(echo "$CATS" | jsonpath '.data | length')
[ "${CN:-0}" -gt 0 ] && ok "categories ($CN)" || bad "categories" "$CATS"
MERCH=$(call GET /merchants/public "")
MN=$(echo "$MERCH" | jsonpath '.data | length')
[ "${MN:-0}" -gt 0 ] && ok "merchants ($MN)" || bad "merchants" "$MERCH"
PID=$(echo "$PRODS" | jsonpath '.data.products[0].productId')
call GET "/products/$PID" "" >/tmp/p1.json
grep -q '"success":true' /tmp/p1.json && ok "product detail $PID" || bad "product detail" "$(cat /tmp/p1.json)"

echo "== cart =="
call GET /cart "$CTOK" >/tmp/cart0.json
grep -q '"success":true' /tmp/cart0.json && ok "GET cart" || bad "GET cart" "$(cat /tmp/cart0.json)"
ADD=$(call POST /cart/items "$CTOK" "{\"productId\":\"$PID\",\"quantity\":2}")
echo "$ADD" | grep -q '"success":true' && ok "POST cart/items" || bad "POST cart/items" "$ADD"
ITEM=$(echo "$ADD" | jsonpath '.data.items[0].id')
call PATCH "/cart/items/$ITEM" "$CTOK" '{"quantity":3}' >/tmp/upd.json
grep -q '"success":true' /tmp/upd.json && ok "PATCH cart/items" || bad "PATCH cart" "$(cat /tmp/upd.json)"
VALID=$(call POST /coupons/validate "" '{"code":"DAIRY20","subtotal":500}')
echo "$VALID" | grep -q '"success":true' && ok "coupons/validate (DAIRY20)" || bad "coupons/validate" "$VALID"

echo "== addresses =="
ADDRS=$(call GET /addresses "$CTOK")
AID=$(echo "$ADDRS" | jsonpath '.data[0].addressId')
[ -n "$AID" ] && [ "$AID" != "null" ] && ok "GET addresses ($AID)" || bad "GET addresses" "$ADDRS"
NEWADDR=$(call POST /addresses "$CTOK" '{"title":"Smoke Test","addressLine1":"1 Test Street","city":"Pune","state":"MH","postalCode":"411001","isDefault":false}')
NAID=$(echo "$NEWADDR" | jsonpath '.data.addressId')
[ -n "$NAID" ] && [ "$NAID" != "null" ] && ok "POST addresses" || bad "POST addresses" "$NEWADDR"

echo "== checkout =="
TOMORROW=$(date -v+1d +%Y-%m-%d 2>/dev/null || date -d tomorrow +%Y-%m-%d)
ORDER=$(call POST /orders/checkout "$CTOK" "{\"addressId\":\"$AID\",\"paymentMethod\":\"CASH_ON_DELIVERY\",\"deliveryDate\":\"$TOMORROW\",\"notes\":\"smoke test\"}")
OID=$(echo "$ORDER" | jsonpath 'if (.data|type)=="array" then .data[0].orderId else .data.orderId end')
[ -n "$OID" ] && [ "$OID" != "null" ] && ok "orders/checkout -> $OID" || bad "checkout" "$ORDER"
call GET /orders "$CTOK" >/tmp/orders.json
grep -q '"success":true' /tmp/orders.json && ok "GET orders" || bad "GET orders" "$(cat /tmp/orders.json)"
call GET "/orders/$OID" "$CTOK" >/tmp/order1.json
grep -q '"success":true' /tmp/order1.json && ok "GET order detail" || bad "GET order" "$(cat /tmp/order1.json)"
DSTATUS=$(echo "$(cat /tmp/order1.json)" | jsonpath '.data.delivery.status')
[ -n "$DSTATUS" ] && [ "$DSTATUS" != "null" ] && ok "delivery record ($DSTATUS)" || bad "delivery record" "$(cat /tmp/order1.json)"

echo "== plans =="
PLANS=$(call GET /dairy-plans "$CTOK")
echo "$PLANS" | grep -q '"success":true' && ok "GET dairy-plans" || bad "GET dairy-plans" "$PLANS"
PLAN=$(echo "$PLANS" | jsonpath '.data[0].planId')
if [ -n "$PLAN" ] && [ "$PLAN" != "null" ]; then
  call GET "/dairy-plans/$PLAN" "$CTOK" >/tmp/plan1.json
  grep -q '"success":true' /tmp/plan1.json && ok "GET plan detail" || bad "GET plan" "$(cat /tmp/plan1.json)"
fi

echo "== notifications / engagement =="
call GET /notifications "$CTOK" >/tmp/notif.json
grep -q '"success":true' /tmp/notif.json && ok "GET notifications" || bad "GET notifications" "$(cat /tmp/notif.json)"
call GET "/customers/dashboard" "$CTOK" >/tmp/dash.json
grep -q '"success":true' /tmp/dash.json && ok "customers/dashboard" || bad "dashboard" "$(cat /tmp/dash.json)"

echo "== users =="
PATCHRES=$(call PATCH /users/me "$CTOK" "{\"name\":\"$CNAME\",\"phone\":\"$CPHONE\"}")
echo "$PATCHRES" | grep -q '"success":true' && ok "PATCH /users/me (profile unchanged)" || bad "PATCH /users/me" "$PATCHRES"

echo "== delivery partner =="
DRES=$(call POST /auth/login "" '{"email":"driver.raj@farmfresh.com","password":"Password@123"}')
DTOK=$(echo "$DRES" | jsonpath '.data.accessToken')
DROLE=$(call GET /users/me "$DTOK" | jsonpath '.data.role')
[ "$DROLE" = "DELIVERY_PARTNER" ] && ok "rider login role=$DROLE" || bad "rider login" "$DRES"
PPROF=$(call GET /delivery-partners/me "$DTOK")
echo "$PPROF" | grep -q '"success":true' && ok "delivery-partners/me" || bad "delivery-partners/me" "$PPROF"
WAS_AVAIL=$(echo "$PPROF" | jsonpath '.data.isAvailable')
call PUT /delivery-partners/me/availability "$DTOK" '{"isAvailable":true}' >/tmp/avail.json
grep -q '"success":true' /tmp/avail.json && ok "set availability" || bad "availability" "$(cat /tmp/avail.json)"
call PUT /deliveries/partner/location "$DTOK" '{"latitude":16.5062,"longitude":80.6480}' >/tmp/loc.json
grep -q '"success":true' /tmp/loc.json && ok "push GPS" || bad "push location" "$(cat /tmp/loc.json)"
call GET "/deliveries/partner/available?latitude=16.5&longitude=80.6" "$DTOK" >/tmp/availorders.json
grep -q '"success":true' /tmp/availorders.json && ok "available deliveries" || bad "available" "$(cat /tmp/availorders.json)"
call GET /deliveries/partner/assigned "$DTOK" >/tmp/assigned.json
grep -q '"success":true' /tmp/assigned.json && ok "assigned deliveries" || bad "assigned" "$(cat /tmp/assigned.json)"

echo "== cleanup =="
[ -n "$NAID" ] && [ "$NAID" != "null" ] && call DELETE "/addresses/$NAID" "$CTOK" >/dev/null && ok "deleted test address"
REMAIN=$(call GET /cart "$CTOK")
if echo "$REMAIN" | grep -q "$ITEM"; then
  call DELETE "/cart/items/$ITEM" "$CTOK" >/dev/null && ok "removed unspent test cart item"
fi
if [ "$WAS_AVAIL" = "false" ]; then
  call PUT /delivery-partners/me/availability "$DTOK" '{"isAvailable":false}' >/dev/null && ok "restored rider offline"
fi

echo
echo "PASS=$pass FAIL=$fail"
[ "$fail" -eq 0 ]
