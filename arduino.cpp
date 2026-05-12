#include <ESP8266WiFi.h>
#include <SPI.h>
#include <MFRC522.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <time.h>

#define WIFI_SSID "Realme"
#define WIFI_PASSWORD "shraud45"
#define FIREBASE_URL "https://rfid-attendance-system-aabc3-default-rtdb.firebaseio.com"
#define BUZZER_PIN D0

MFRC522 mfrc522(D2, D1);

String getStudentId(String uid) {
  if (uid == "03DFCCFA") return "S001";
  else if (uid == "F75E8468") return "S002";
  else if (uid == "E73F8468") return "S003";
  else if (uid == "97348768") return "S004";
  else if (uid == "274A8C68") return "S005";
  else if (uid == "27EA8868") return "S006";
  else if (uid == "E7E48C68") return "S007"; // Added
  else if (uid == "F7568C68") return "S008"; // Added
  else if (uid == "571A9568") return "S009";
  else if (uid == "97E18468") return "S010";
  else if (uid == "97DB8768") return "S011";
  return "";
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  configTime(20700, 0, "pool.ntp.org");
  SPI.begin();
  mfrc522.PCD_Init();
}

void loop() {
  if (!mfrc522.PICC_IsNewCardPresent() || !mfrc522.PICC_ReadCardSerial()) return;

  String uid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    uid += (mfrc522.uid.uidByte[i] < 0x10 ? "0" : "") + String(mfrc522.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();

  processAttendance(uid);
  
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
}

void processAttendance(String uid) {
  WiFiClientSecure client; client.setInsecure();
  HTTPClient https;

  https.begin(client, String(FIREBASE_URL) + "/activeSession.json");
  if (https.GET() == 200) {
    StaticJsonDocument<512> doc;
    deserializeJson(doc, https.getString());
    
    if (doc["status"] != "active") {
      Serial.println("Scan Ignored: Session Inactive");
      return;
    }

    String sid = getStudentId(uid);
    if (sid == "") {
      Serial.println("Unknown Card: " + uid);
      return;
    }

    String path = "/attendance/" + doc["subject"].as<String>() + "/" + 
                  doc["date"].as<String>() + "_" + doc["sessionId"].as<String>() + "/" + sid + ".json";
    
    // Check if already marked to avoid double popup
    https.begin(client, String(FIREBASE_URL) + path);
    if (https.GET() == 200 && https.getString() != "null") {
      Serial.println("Already marked");
      return;
    }

    // Write attendance
    String timeNow = getTime();
    String jsonData = "{\"status\":\"present\",\"time\":\"" + timeNow + "\"}";
    https.begin(client, String(FIREBASE_URL) + path);
    if (https.PUT(jsonData) == 200) {
      Serial.println("Marked: " + sid);
      digitalWrite(BUZZER_PIN, HIGH); delay(300); digitalWrite(BUZZER_PIN, LOW);
    }
  }
  https.end();
}

String getTime() {
  time_t now = time(nullptr); struct tm* t = localtime(&now);
  char buf[10]; sprintf(buf, "%02d:%02d", t->tm_hour, t->tm_min);
  return String(buf);
}