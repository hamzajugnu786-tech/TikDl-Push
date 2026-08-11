#!/usr/bin/env bash
# Test script for Advertisement Management Center — page isolation, global ads, persistence, discovery.
# Run after `npm run dev` is up on http://localhost:3000.
set -u
BASE="http://localhost:3000"
COOKIES=/tmp/tikdl-test-cookies.txt
rm -f "$COOKIES"

PASS=0
FAIL=0
declare -a FAILURES=()

assert_contains() {
  local label="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    echo "✓ PASS: $label"
    PASS=$((PASS+1))
  else
    echo "✗ FAIL: $label"
    echo "  expected to contain: $needle"
    echo "  actual: ${haystack:0:300}"
    FAIL=$((FAIL+1))
    FAILURES+=("$label")
  fi
}

assert_not_contains() {
  local label="$1" needle="$2" haystack="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    echo "✗ FAIL: $label"
    echo "  should NOT contain: $needle"
    echo "  actual: ${haystack:0:300}"
    FAIL=$((FAIL+1))
    FAILURES+=("$label")
  else
    echo "✓ PASS: $label"
    PASS=$((PASS+1))
  fi
}

echo "=========================================="
echo "Test 0: Admin login"
echo "=========================================="
LOGIN=$(curl -s -c "$COOKIES" -X POST "$BASE/api/admin/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"password":"test123"}')
echo "Login response: $LOGIN"
assert_contains "Login succeeds" '"success":true' "$LOGIN"

# Verify auth cookie was set
if [ -f "$COOKIES" ] && grep -q "tikdl_admin\|admin_session\|token" "$COOKIES"; then
  echo "✓ PASS: Auth cookie set"
  PASS=$((PASS+1))
else
  echo "✗ FAIL: Auth cookie not set"
  FAIL=$((FAIL+1))
  FAILURES+=("Auth cookie")
  cat "$COOKIES" 2>/dev/null
fi

echo ""
echo "=========================================="
echo "Test 6 (run early): New page auto-discovery (/tools)"
echo "=========================================="
PAGES=$(curl -s -b "$COOKIES" "$BASE/api/config/pages")
echo "Pages response (first 400 chars): ${PAGES:0:400}"
assert_contains "Tools page auto-discovered" '"key":"tools"' "$PAGES"
assert_contains "Homepage in pages list" '"key":"homepage"' "$PAGES"
assert_contains "Global tab present" '"key":"all"' "$PAGES"

echo ""
echo "=========================================="
echo "Setup: Clean DB + create test ads"
echo "=========================================="
# Get current ads so we can delete them all
CURR_ADS=$(curl -s -b "$COOKIES" "$BASE/api/admin/config")
EXISTING_IDS=$(echo "$CURR_ADS" | python3 -c "import sys, json; data=json.load(sys.stdin); print(' '.join(a['id'] for a in data.get('ads',[]) if a.get('id')))" 2>/dev/null)
if [ -n "$EXISTING_IDS" ]; then
  echo "Deleting existing ads: $EXISTING_IDS"
  DEL_PAYLOAD=$(echo "$EXISTING_IDS" | python3 -c "import sys, json; ids=sys.stdin.read().split(); print(json.dumps({'deleteAds': ids}))")
  curl -s -b "$COOKIES" -X POST "$BASE/api/admin/config" \
    -H "Content-Type: application/json" \
    -d "$DEL_PAYLOAD" > /dev/null
fi

# Create 5 test ads:
# 1. HOME + HERO          → only on HOME
# 2. GLOBAL + ABOVE_FOOTER → on every page
# 3. HOME + BETWEEN_RESULT_RECENT (780×90 ad)
# 4. HOME + BETWEEN_FEATURES_FAQ (350×250 ad)
# 5. ABOUT + HERO          → only on ABOUT (no hero_section placement on about, but DB allows it)
echo "Creating 5 test ads..."
CREATE_PAYLOAD='{
  "ads": [
    {
      "name": "HOME Hero Test Ad",
      "template": "leaderboard",
      "enabled": true,
      "type": "display",
      "page": "homepage",
      "placement": "hero_section",
      "position": "center",
      "dimensions": "728x90",
      "adCode": "<!-- HOME HERO AD -->",
      "description": "Test 1: homepage hero",
      "priority": 1
    },
    {
      "name": "Global Footer Test Ad",
      "template": "leaderboard",
      "enabled": true,
      "type": "display",
      "page": "all",
      "placement": "above_footer",
      "position": "center",
      "dimensions": "728x90",
      "adCode": "<!-- GLOBAL FOOTER AD -->",
      "description": "Test 2: global footer",
      "priority": 1
    },
    {
      "name": "HOME Between Result/Recent 780x90",
      "template": "leaderboard",
      "enabled": true,
      "type": "display",
      "page": "homepage",
      "placement": "between_result_recent",
      "position": "center",
      "dimensions": "780x90",
      "adCode": "<!-- HOME 780x90 AD -->",
      "description": "Test 3: homepage 780x90",
      "priority": 1
    },
    {
      "name": "HOME Between Features/FAQ 350x250",
      "template": "medium_rectangle",
      "enabled": true,
      "type": "display",
      "page": "homepage",
      "placement": "between_features_faq",
      "position": "center",
      "dimensions": "350x250",
      "adCode": "<!-- HOME 350x250 AD -->",
      "description": "Test 4: homepage 350x250",
      "priority": 1
    },
    {
      "name": "ABOUT Hero Test Ad",
      "template": "leaderboard",
      "enabled": true,
      "type": "display",
      "page": "about",
      "placement": "header_banner",
      "position": "center",
      "dimensions": "728x90",
      "adCode": "<!-- ABOUT HEADER AD -->",
      "description": "Test 5: about page header",
      "priority": 1
    }
  ]
}'
CREATE_RES=$(curl -s -b "$COOKIES" -X POST "$BASE/api/admin/config" \
  -H "Content-Type: application/json" \
  -d "$CREATE_PAYLOAD")
echo "Create response (first 200 chars): ${CREATE_RES:0:200}"
assert_contains "Create 5 ads succeeds" '"success":true' "$CREATE_RES"

# Extract created ad IDs for later tests
AD_IDS=$(echo "$CREATE_RES" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for a in data.get('ads', []):
    print(a.get('id',''))
" 2>/dev/null)
echo "Created ad IDs:"
echo "$AD_IDS"
AD_COUNT=$(echo "$AD_IDS" | grep -c . )
if [ "$AD_COUNT" = "5" ]; then
  echo "✓ PASS: 5 ads created with DB IDs"
  PASS=$((PASS+1))
else
  echo "✗ FAIL: Expected 5 ad IDs, got $AD_COUNT"
  FAIL=$((FAIL+1))
  FAILURES+=("5 ads created")
fi

echo ""
echo "=========================================="
echo "Test 1 — Homepage Hero only on HOME (page isolation)"
echo "=========================================="
HOME_ADS=$(curl -s "$BASE/api/config/ads?pages=homepage")
ABOUT_ADS=$(curl -s "$BASE/api/config/ads?pages=about")
CONTACT_ADS=$(curl -s "$BASE/api/config/ads?pages=contact")

echo "Homepage adsByPage keys: $(echo $HOME_ADS | python3 -c 'import sys,json; d=json.load(sys.stdin); print(list(d.get(\"adsByPage\",{}).keys()))' 2>/dev/null)"
echo "About adsByPage keys: $(echo $ABOUT_ADS | python3 -c 'import sys,json; d=json.load(sys.stdin); print(list(d.get(\"adsByPage\",{}).keys()))' 2>/dev/null)"

# Verify HOME HERO ad appears in homepage response
HOME_HAS_HERO=$(echo "$HOME_ADS" | python3 -c '
import sys, json
d = json.load(sys.stdin)
found = False
for a in d.get("adsByPage", {}).get("homepage", []):
    if a.get("placement") == "hero_section" and "HOME HERO" in a.get("adCode", ""):
        found = True
        break
# Also check legacy inlineAds bucket (used by homepage JSX)
for a in d.get("inlineAds", []):
    if a.get("placement") == "hero_section" and "HOME HERO" in a.get("adCode", ""):
        found = True
        break
print("YES" if found else "NO")
' 2>/dev/null)
if [ "$HOME_HAS_HERO" = "YES" ]; then
  echo "✓ PASS: HOME HERO ad renders on HOME"
  PASS=$((PASS+1))
else
  echo "✗ FAIL: HOME HERO ad NOT found in homepage response"
  FAIL=$((FAIL+1))
  FAILURES+=("Test 1: HOME HERO on HOME")
  echo "  Homepage adsByPage.homepage: $(echo $HOME_ADS | python3 -c 'import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get("adsByPage",{}).get("homepage",[])[:3], indent=2))' 2>/dev/null)"
fi

# Verify HOME HERO ad does NOT appear in about/contact
ABOUT_HAS_HERO=$(echo "$ABOUT_ADS" | python3 -c '
import sys, json
d = json.load(sys.stdin)
found = False
for a in d.get("adsByPage", {}).get("about", []):
    if a.get("placement") == "hero_section" and "HOME HERO" in a.get("adCode", ""):
        found = True
print("YES" if found else "NO")
' 2>/dev/null)
if [ "$ABOUT_HAS_HERO" = "NO" ]; then
  echo "✓ PASS: HOME HERO ad does NOT render on ABOUT"
  PASS=$((PASS+1))
else
  echo "✗ FAIL: HOME HERO ad leaked to ABOUT — page isolation broken"
  FAIL=$((FAIL+1))
  FAILURES+=("Test 1: HOME HERO NOT on ABOUT")
fi

CONTACT_HAS_HERO=$(echo "$CONTACT_ADS" | python3 -c '
import sys, json
d = json.load(sys.stdin)
found = False
for a in d.get("adsByPage", {}).get("contact", []):
    if a.get("placement") == "hero_section" and "HOME HERO" in a.get("adCode", ""):
        found = True
print("YES" if found else "NO")
' 2>/dev/null)
if [ "$CONTACT_HAS_HERO" = "NO" ]; then
  echo "✓ PASS: HOME HERO ad does NOT render on CONTACT"
  PASS=$((PASS+1))
else
  echo "✗ FAIL: HOME HERO ad leaked to CONTACT"
  FAIL=$((FAIL+1))
  FAILURES+=("Test 1: HOME HERO NOT on CONTACT")
fi

echo ""
echo "=========================================="
echo "Test 2 — Global Footer ad on every page"
echo "=========================================="
for PAGE in homepage about contact privacy terms dmca tools; do
  G_ADS=$(curl -s "$BASE/api/config/ads?pages=$PAGE")
  HAS_GLOBAL=$(echo "$G_ADS" | python3 -c '
import sys, json
d = json.load(sys.stdin)
found = False
for a in d.get("adsByPage", {}).get("'"$PAGE"'", []):
    if a.get("placement") == "above_footer" and "GLOBAL FOOTER" in a.get("adCode", ""):
        found = True
        break
# Also check legacy bannerAds bucket (homepage uses this)
for a in d.get("bannerAds", []):
    if a.get("placement") == "above_footer" and "GLOBAL FOOTER" in a.get("adCode", ""):
        found = True
        break
print("YES" if found else "NO")
' 2>/dev/null)
  if [ "$HAS_GLOBAL" = "YES" ]; then
    echo "✓ PASS: GLOBAL FOOTER ad renders on /$PAGE"
    PASS=$((PASS+1))
  else
    echo "✗ FAIL: GLOBAL FOOTER ad NOT found on /$PAGE"
    FAIL=$((FAIL+1))
    FAILURES+=("Test 2: GLOBAL on /$PAGE")
  fi
done

echo ""
echo "=========================================="
echo "Test 3 — Homepage 780×90 placement (visibility + update + persist)"
echo "=========================================="
HOME_HAS_780=$(echo "$HOME_ADS" | python3 -c '
import sys, json
d = json.load(sys.stdin)
found = False
for a in d.get("adsByPage", {}).get("homepage", []):
    if a.get("placement") == "between_result_recent" and a.get("dimensions") == "780x90":
        found = True
        break
for a in d.get("inlineAds", []):
    if a.get("placement") == "between_result_recent" and a.get("dimensions") == "780x90":
        found = True
        break
print("YES" if found else "NO")
' 2>/dev/null)
if [ "$HOME_HAS_780" = "YES" ]; then
  echo "✓ PASS: Homepage 780×90 ad visible in API response"
  PASS=$((PASS+1))
else
  echo "✗ FAIL: Homepage 780×90 ad NOT found"
  FAIL=$((FAIL+1))
  FAILURES+=("Test 3: 780x90 visible")
fi

# Find the ID of the 780x90 ad
AD_ID_780=$(echo "$CREATE_RES" | python3 -c '
import sys, json
d = json.load(sys.stdin)
for a in d.get("ads", []):
    if a.get("placement") == "between_result_recent" and a.get("page") == "homepage":
        print(a.get("id",""))
        break
' 2>/dev/null)
echo "780x90 ad ID: $AD_ID_780"

# Update its adCode
UPDATE_PAYLOAD=$(python3 -c "
import json
ads = [{
    'id': '$AD_ID_780',
    'name': 'HOME Between Result/Recent 780x90',
    'template': 'leaderboard',
    'enabled': True,
    'type': 'display',
    'page': 'homepage',
    'placement': 'between_result_recent',
    'position': 'center',
    'dimensions': '780x90',
    'adCode': '<!-- UPDATED 780x90 CODE -->',
    'description': 'Test 3: updated code',
    'priority': 1
}]
print(json.dumps({'ads': ads}))
")
UPDATE_RES=$(curl -s -b "$COOKIES" -X POST "$BASE/api/admin/config" \
  -H "Content-Type: application/json" \
  -d "$UPDATE_PAYLOAD")
assert_contains "Update 780x90 ad succeeds" '"success":true' "$UPDATE_RES"

# Reload and verify the new code is persisted
RELOAD=$(curl -s -b "$COOKIES" "$BASE/api/admin/config")
assert_contains "Updated 780x90 code persisted" "UPDATED 780x90 CODE" "$RELOAD"

echo ""
echo "=========================================="
echo "Test 4 — Homepage 350×250 placement (toggle OFF then back ON)"
echo "=========================================="
AD_ID_350=$(echo "$CREATE_RES" | python3 -c '
import sys, json
d = json.load(sys.stdin)
for a in d.get("ads", []):
    if a.get("placement") == "between_features_faq" and a.get("page") == "homepage":
        print(a.get("id",""))
        break
' 2>/dev/null)
echo "350x250 ad ID: $AD_ID_350"

# Toggle OFF
TOGGLE_OFF_PAYLOAD=$(python3 -c "
import json
ads = [{
    'id': '$AD_ID_350',
    'name': 'HOME Between Features/FAQ 350x250',
    'template': 'medium_rectangle',
    'enabled': False,
    'type': 'display',
    'page': 'homepage',
    'placement': 'between_features_faq',
    'position': 'center',
    'dimensions': '350x250',
    'adCode': '<!-- HOME 350x250 AD -->',
    'description': 'Test 4: disabled',
    'priority': 1
}]
print(json.dumps({'ads': ads}))
")
OFF_RES=$(curl -s -b "$COOKIES" -X POST "$BASE/api/admin/config" \
  -H "Content-Type: application/json" \
  -d "$TOGGLE_OFF_PAYLOAD")
assert_contains "Toggle OFF 350x250 ad succeeds" '"success":true' "$OFF_RES"

# Verify ad disappears from public /api/config/ads
HOME_AFTER_OFF=$(curl -s "$BASE/api/config/ads?pages=homepage")
HAS_350_AFTER_OFF=$(echo "$HOME_AFTER_OFF" | python3 -c '
import sys, json
d = json.load(sys.stdin)
found = False
for a in d.get("adsByPage", {}).get("homepage", []):
    if a.get("placement") == "between_features_faq" and a.get("dimensions") == "350x250":
        found = True
        break
for a in d.get("inlineAds", []):
    if a.get("placement") == "between_features_faq" and a.get("dimensions") == "350x250":
        found = True
        break
print("YES" if found else "NO")
' 2>/dev/null)
if [ "$HAS_350_AFTER_OFF" = "NO" ]; then
  echo "✓ PASS: 350x250 ad disappeared from public ads API after disable"
  PASS=$((PASS+1))
else
  echo "✗ FAIL: 350x250 ad still in public response after disable"
  FAIL=$((FAIL+1))
  FAILURES+=("Test 4: 350x250 hidden after disable")
fi

# Toggle ON
TOGGLE_ON_PAYLOAD=$(python3 -c "
import json
ads = [{
    'id': '$AD_ID_350',
    'name': 'HOME Between Features/FAQ 350x250',
    'template': 'medium_rectangle',
    'enabled': True,
    'type': 'display',
    'page': 'homepage',
    'placement': 'between_features_faq',
    'position': 'center',
    'dimensions': '350x250',
    'adCode': '<!-- HOME 350x250 AD -->',
    'description': 'Test 4: re-enabled',
    'priority': 1
}]
print(json.dumps({'ads': ads}))
")
ON_RES=$(curl -s -b "$COOKIES" -X POST "$BASE/api/admin/config" \
  -H "Content-Type: application/json" \
  -d "$TOGGLE_ON_PAYLOAD")
assert_contains "Toggle ON 350x250 ad succeeds" '"success":true' "$ON_RES"

# Verify ad reappears
HOME_AFTER_ON=$(curl -s "$BASE/api/config/ads?pages=homepage")
HAS_350_AFTER_ON=$(echo "$HOME_AFTER_ON" | python3 -c '
import sys, json
d = json.load(sys.stdin)
found = False
for a in d.get("adsByPage", {}).get("homepage", []):
    if a.get("placement") == "between_features_faq" and a.get("dimensions") == "350x250":
        found = True
        break
for a in d.get("inlineAds", []):
    if a.get("placement") == "between_features_faq" and a.get("dimensions") == "350x250":
        found = True
        break
print("YES" if found else "NO")
' 2>/dev/null)
if [ "$HAS_350_AFTER_ON" = "YES" ]; then
  echo "✓ PASS: 350x250 ad returned after re-enable"
  PASS=$((PASS+1))
else
  echo "✗ FAIL: 350x250 ad did not return after re-enable"
  FAIL=$((FAIL+1))
  FAILURES+=("Test 4: 350x250 back after re-enable")
fi

echo ""
echo "=========================================="
echo "Test 5 — Page isolation (different HERO ads per page)"
echo "=========================================="
# Already have:
#  - HOME + hero_section = "HOME HERO AD"
#  - ABOUT + header_banner = "ABOUT HEADER AD"  (header_banner is the content-page equivalent of hero)
ABOUT_ADS_FRESH=$(curl -s "$BASE/api/config/ads?pages=about")
ABOUT_HAS_ABOUT_HEADER=$(echo "$ABOUT_ADS_FRESH" | python3 -c '
import sys, json
d = json.load(sys.stdin)
found = False
for a in d.get("adsByPage", {}).get("about", []):
    if a.get("placement") == "header_banner" and "ABOUT HEADER" in a.get("adCode", ""):
        found = True
print("YES" if found else "NO")
' 2>/dev/null)
if [ "$ABOUT_HAS_ABOUT_HEADER" = "YES" ]; then
  echo "✓ PASS: ABOUT-specific header_banner ad renders on ABOUT"
  PASS=$((PASS+1))
else
  echo "✗ FAIL: ABOUT-specific header_banner ad NOT found"
  FAIL=$((FAIL+1))
  FAILURES+=("Test 5: ABOUT ad on ABOUT")
fi

# Verify the ABOUT ad does NOT render on HOME
HOME_HAS_ABOUT_HEADER=$(echo "$HOME_ADS" | python3 -c '
import sys, json
d = json.load(sys.stdin)
found = False
for a in d.get("adsByPage", {}).get("homepage", []):
    if "ABOUT HEADER" in a.get("adCode", ""):
        found = True
for a in d.get("ads", []):
    if "ABOUT HEADER" in a.get("adCode", ""):
        found = True
for a in d.get("inlineAds", []):
    if "ABOUT HEADER" in a.get("adCode", ""):
        found = True
for a in d.get("bannerAds", []):
    if "ABOUT HEADER" in a.get("adCode", ""):
        found = True
print("YES" if found else "NO")
' 2>/dev/null)
if [ "$HOME_HAS_ABOUT_HEADER" = "NO" ]; then
  echo "✓ PASS: ABOUT header_banner ad does NOT render on HOME"
  PASS=$((PASS+1))
else
  echo "✗ FAIL: ABOUT header_banner ad leaked to HOME"
  FAIL=$((FAIL+1))
  FAILURES+=("Test 5: ABOUT ad NOT on HOME")
fi

echo ""
echo "=========================================="
echo "Test 7 — Persistence (reload admin config + verify changes survived)"
echo "=========================================="
PERSIST=$(curl -s -b "$COOKIES" "$BASE/api/admin/config")
assert_contains "780x80 ad code change persisted" "UPDATED 780x90 CODE" "$PERSIST"
assert_contains "350x250 ad still present" "HOME 350x250 AD" "$PERSIST"
assert_contains "HOME HERO ad still present" "HOME HERO AD" "$PERSIST"
assert_contains "GLOBAL FOOTER ad still present" "GLOBAL FOOTER AD" "$PERSIST"
assert_contains "ABOUT HEADER ad still present" "ABOUT HEADER AD" "$PERSIST"

# Verify ad count = 5
AD_COUNT_PERSIST=$(echo "$PERSIST" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('ads',[])))" 2>/dev/null)
if [ "$AD_COUNT_PERSIST" = "5" ]; then
  echo "✓ PASS: All 5 ads persisted in DB"
  PASS=$((PASS+1))
else
  echo "✗ FAIL: Expected 5 ads in DB after reload, got $AD_COUNT_PERSIST"
  FAIL=$((FAIL+1))
  FAILURES+=("Test 7: 5 ads persisted")
fi

# Verify global footer ad renders on /tools (new page)
TOOLS_ADS=$(curl -s "$BASE/api/config/ads?pages=tools")
TOOLS_HAS_GLOBAL=$(echo "$TOOLS_ADS" | python3 -c '
import sys, json
d = json.load(sys.stdin)
found = False
for a in d.get("adsByPage", {}).get("tools", []):
    if a.get("placement") == "above_footer" and "GLOBAL FOOTER" in a.get("adCode", ""):
        found = True
print("YES" if found else "NO")
' 2>/dev/null)
if [ "$TOOLS_HAS_GLOBAL" = "YES" ]; then
  echo "✓ PASS: Global footer ad renders on /tools (newly discovered page)"
  PASS=$((PASS+1))
else
  echo "✗ FAIL: Global footer ad does NOT render on /tools"
  FAIL=$((FAIL+1))
  FAILURES+=("Test 7: global on /tools")
fi

echo ""
echo "=========================================="
echo "Test — Delete flow (verify delete removes from DB)"
echo "=========================================="
# Get one of the existing ad IDs
DEL_ID=$(echo "$PERSIST" | python3 -c '
import sys, json
d = json.load(sys.stdin)
for a in d.get("ads", []):
    if a.get("placement") == "between_features_faq":
        print(a.get("id",""))
        break
' 2>/dev/null)
echo "Deleting ad: $DEL_ID"
DEL_RES=$(curl -s -b "$COOKIES" -X POST "$BASE/api/admin/config" \
  -H "Content-Type: application/json" \
  -d "{\"deleteAds\":[\"$DEL_ID\"]}")
assert_contains "Delete ad succeeds" '"success":true' "$DEL_RES"
# Verify it's gone
AFTER_DEL=$(curl -s -b "$COOKIES" "$BASE/api/admin/config")
AD_COUNT_AFTER_DEL=$(echo "$AFTER_DEL" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('ads',[])))" 2>/dev/null)
if [ "$AD_COUNT_AFTER_DEL" = "4" ]; then
  echo "✓ PASS: Ad deleted, count went from 5 → 4"
  PASS=$((PASS+1))
else
  echo "✗ FAIL: After delete, expected 4 ads, got $AD_COUNT_AFTER_DEL"
  FAIL=$((FAIL+1))
  FAILURES+=("Delete flow")
fi

echo ""
echo "=========================================="
echo "SUMMARY"
echo "=========================================="
echo "PASS: $PASS"
echo "FAIL: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "FAILED TESTS:"
  for f in "${FAILURES[@]}"; do echo "  - $f"; done
  exit 1
fi
echo "All advertisement management tests passed."
