"""Spark X 认证测试 - 试不同 secret 和签名格式"""
import hmac, hashlib, base64, json
from datetime import datetime, timezone
import http.client, ssl

APIKEY = "ed7fb8a0c4d6664da13838aee05eaeb2"
APISECRET_RAW = "OTE3ZmVjNDAwMzM5ZGUyYmRkYjBhYThl"
APISECRET_DECODED = base64.b64decode(APISECRET_RAW).decode()  # 917fec400339de2bddb0aa8e
HOST = "spark-api-open.xf-yun.com"
body = {"model": "x2", "messages": [{"role": "user", "content": "hi"}], "max_tokens": 5}


def send_raw(path, headers):
    body_bytes = json.dumps(body).encode()
    ctx = ssl.create_default_context()
    conn = http.client.HTTPSConnection(HOST, 443, context=ctx)
    conn.putrequest("POST", path, skip_host=True, skip_accept_encoding=True)
    for k, v in headers.items():
        conn.putheader(k, v)
    conn.putheader("Content-Length", str(len(body_bytes)))
    conn.endheaders(body_bytes)
    resp = conn.getresponse()
    text = resp.read().decode()[:200]
    conn.close()
    return resp.status, text


def test_hmac(path, secret, label):
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%a, %d %b %Y %H:%M:%S GMT")

    sig_origin = f"host: {HOST}\ndate: {date_str}\nrequest-line: POST {path} HTTP/1.1"
    sig = base64.b64encode(
        hmac.new(secret.encode(), sig_origin.encode(), hashlib.sha256).digest()
    ).decode()
    auth_raw = f'api_key="{APIKEY}", algorithm="hmac-sha256", headers="host date request-line", signature="{sig}"'
    auth = base64.b64encode(auth_raw.encode()).decode()

    headers = {"Host": HOST, "Date": date_str, "Content-Type": "application/json", "Authorization": auth}
    status, text = send_raw(path, headers)
    print(f"[{label}] {path} => {status}: {text[:150]}")


def test_simple_sig(path, secret, label):
    """试只用 date 作为签名原文"""
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%a, %d %b %Y %H:%M:%S GMT")

    # 只签 date
    sig = base64.b64encode(
        hmac.new(secret.encode(), date_str.encode(), hashlib.sha256).digest()
    ).decode()
    auth = f"hmac username=\"{APIKEY}\", algorithm=\"hmac-sha256\", headers=\"date\", signature=\"{sig}\""

    headers = {"Host": HOST, "Date": date_str, "Content-Type": "application/json", "Authorization": auth}
    status, text = send_raw(path, headers)
    print(f"[{label}] {path} => {status}: {text[:150]}")


if __name__ == "__main__":
    path = "/x2/chat/completions"

    print(f"APISECRET raw: {APISECRET_RAW}")
    print(f"APISECRET decoded: {APISECRET_DECODED}")
    print()

    # Test 1: 用解码后的 secret 做 HMAC
    print("=== Test: decoded secret ===")
    test_hmac(path, APISECRET_DECODED, "decoded-HMAC")

    # Test 2: 用原始 secret 做 HMAC
    print("\n=== Test: raw secret ===")
    test_hmac(path, APISECRET_RAW, "raw-HMAC")

    # Test 3: 简单签名 (只签 date)
    print("\n=== Test: simple sig (date only) ===")
    test_simple_sig(path, APISECRET_RAW, "simple-raw")
    test_simple_sig(path, APISECRET_DECODED, "simple-decoded")

    # Test 4: 试用 hashlib sha256 (不是 hmac)
    print("\n=== Test: plain sha256 (no HMAC) ===")
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%a, %d %b %Y %H:%M:%S GMT")
    sig_origin = f"host: {HOST}\ndate: {date_str}\nrequest-line: POST {path} HTTP/1.1"
    for secret, label in [(APISECRET_RAW, "raw"), (APISECRET_DECODED, "decoded")]:
        sig = base64.b64encode(hashlib.sha256((secret + sig_origin).encode()).digest()).decode()
        auth_raw = f'api_key="{APIKEY}", algorithm="hmac-sha256", headers="host date request-line", signature="{sig}"'
        auth = base64.b64encode(auth_raw.encode()).decode()
        headers = {"Host": HOST, "Date": date_str, "Content-Type": "application/json", "Authorization": auth}
        status, text = send_raw(path, headers)
        print(f"[sha256-{label}] => {status}: {text[:150]}")

    # Test 5: 用 MD5 而不是 SHA256
    print("\n=== Test: HMAC-MD5 ===")
    now = datetime.now(timezone.utc)
    date_str = now.strftime("%a, %d %b %Y %H:%M:%S GMT")
    sig_origin = f"host: {HOST}\ndate: {date_str}\nrequest-line: POST {path} HTTP/1.1"
    for secret, label in [(APISECRET_RAW, "raw"), (APISECRET_DECODED, "decoded")]:
        sig = base64.b64encode(hmac.new(secret.encode(), sig_origin.encode(), hashlib.md5).digest()).decode()
        auth_raw = f'api_key="{APIKEY}", algorithm="hmac-md5", headers="host date request-line", signature="{sig}"'
        auth = base64.b64encode(auth_raw.encode()).decode()
        headers = {"Host": HOST, "Date": date_str, "Content-Type": "application/json", "Authorization": auth}
        status, text = send_raw(path, headers)
        print(f"[md5-{label}] => {status}: {text[:150]}")
