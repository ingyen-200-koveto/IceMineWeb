#!/usr/bin/env bash
set -euo pipefail

ENV=/opt/icemine/.env
kek(){ printf '\n\033[1;36m== %s ==\033[0m\n' "$1"; }
hiba(){ printf '\n\033[1;31mHIBA: %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" = 0 ] || hiba "Rootként futtasd."
[ -f "$ENV" ] || hiba "Nem találom: $ENV. Előbb a telepites.sh kell."
command -v curl >/dev/null || hiba "Hiányzik a curl (apt install curl)."

kek "Éles Stripe fizetés beállítása"
echo "A kulcsok gépelés közben nem látszanak. Beillesztés: jobb klikk vagy Ctrl+Shift+V."
echo

read -rsp "Éles titkos kulcs (sk_live_...): " KULCS </dev/tty; echo
KULCS=$(printf '%s' "$KULCS" | tr -d '[:space:]')
case "$KULCS" in
  sk_live_*|rk_live_*) ;;
  sk_test_*|rk_test_*) hiba "Ez TESZT kulcs (sk_test_). A Stripe-ban kapcsold ki a 'Test mode' / 'Sandbox' módot, és onnan másold ki a Secret key-t." ;;
  *) hiba "A kulcsnak sk_live_ kezdetűnek kell lennie (Stripe > Developers > API keys > Secret key)." ;;
esac

echo "Kulcs ellenőrzése a Stripe-nál..."
stripe_get(){ printf 'user = "%s:"\n' "$KULCS" | curl -s -K - "$@"; }
KOD=$(stripe_get -o /tmp/stripe-ell.$$ -w '%{http_code}' "https://api.stripe.com/v1/checkout/sessions?limit=1" || true)
VALASZ=$(cat /tmp/stripe-ell.$$ 2>/dev/null || true); rm -f /tmp/stripe-ell.$$
[ "$KOD" = 000 ] && hiba "Nem érem el a Stripe-ot (api.stripe.com). Van internet a szerveren?"
[ "$KOD" = 200 ] || hiba "A Stripe nem fogadta el a kulcsot (HTTP $KOD). $(printf '%s' "$VALASZ" | grep -o '"message": *"[^"]*"' | head -n1)"
echo "Rendben, a kulcs működik."

FIOK=$(stripe_get "https://api.stripe.com/v1/account" || true)
if printf '%s' "$FIOK" | grep -q '"charges_enabled": *false'; then
  echo
  echo "FIGYELEM: a Stripe fiókod még nem fogadhat éles fizetést (charges_enabled = false)."
  echo "Fejezd be az aktiválást a Stripe-ban (cégadatok, bankszámla, személyazonosság), különben a fizetés nem fog menni."
fi

echo
echo "Most a Stripe-ban ÉLES módban (Test mode kikapcsolva):"
echo "  Developers > Webhooks > Add endpoint"
DOMAIN=$(sed -n 's|^BASE_URL=||p' "$ENV" | head -n1)
echo "  URL: ${DOMAIN:-https://a-te-domained}/api/stripe-webhook"
echo "  Események: checkout.session.completed, checkout.session.async_payment_succeeded"
echo "Mentés után a 'Signing secret' (whsec_...) kell ide."
echo
read -rsp "Webhook signing secret (whsec_...): " WH </dev/tty; echo
WH=$(printf '%s' "$WH" | tr -d '[:space:]')
case "$WH" in whsec_*) ;; *) hiba "A webhook titoknak whsec_ kezdetűnek kell lennie." ;; esac

kek "Mentés"
MENTES="/var/lib/icemine/env-teszt-mentes-$(date +%Y%m%d-%H%M%S)"
cp -p "$ENV" "$MENTES"; chmod 600 "$MENTES"
UJ=$(mktemp)
grep -v -E '^\s*(STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET)\s*=' "$ENV" > "$UJ" || true
printf 'STRIPE_SECRET_KEY=%s\nSTRIPE_WEBHOOK_SECRET=%s\n' "$KULCS" "$WH" >> "$UJ"
cat "$UJ" > "$ENV"; rm -f "$UJ"
chown icemine:icemine "$ENV"; chmod 600 "$ENV"
unset KULCS WH
echo "A régi beállítás mentve ide: $MENTES"

systemctl restart icemine
sleep 4
kek "Eredmény"
journalctl -u icemine --since "-15s" --no-pager -o cat | grep -E '^Fizetés:' | tail -n 3 || true
echo
echo "Ha fent 'ÉLES mód' látszik, kész. A 4242 4242 4242 4242 tesztkártyát a Stripe innentől elutasítja."
