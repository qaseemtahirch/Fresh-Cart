import React, { useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, apiError } from "../services/api";
import { useCart } from "../context/CartContext";
import { theme } from "../theme/theme";
import { money } from "../utils/format";
import { Button, Card, Header, StatusPill } from "../components/UI";
import {
  screen,
  pad,
} from "../utils/screenHelpers";

export function PaymentScreen({ route, navigation }) {
  const { clear } = useCart();
  const [busy, setBusy] = useState(false),
    [ref, setRef] = useState(null),
    [status, setStatus] = useState("pending");
  const initiate = async () => {
    try {
      setBusy(true);
      const r = await api.post("/payments/jazzcash/initiate", {
        order_id: route.params.orderId,
      });
      setRef(r.data.txn_ref);
      setStatus(r.data.status || "pending");
      if (r.data.status === "paid") {
        clear();
        navigation.replace("Order Confirmation", {
          orderId: route.params.orderId,
          total: route.params.total,
        });
      }
    } catch (e) {
      Alert.alert("JazzCash payment failed", apiError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={screen}>
      <Header title="Payment" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={pad}>
        <View style={s.jazzHero}>
          <Text style={s.jazzLogo}>JazzCash</Text>
          <Text style={s.jazzSecure}>
            ✓ Secure payment via FreshCart backend
          </Text>
        </View>
        <Card>
          <Text style={s.label}>Amount to pay</Text>
          <Text style={s.payAmount}>{money(route.params?.total || 0)}</Text>
          <Text style={s.muted}>
            Your merchant credentials remain securely on the server.
          </Text>
        </Card>
        {ref && (
          <Card style={{ marginTop: 12 }}>
            <Text style={s.name}>Transaction reference</Text>
            <Text style={s.ref}>{ref}</Text>
            <StatusPill status={status} />
          </Card>
        )}
        <Button
          title={ref ? "Check payment status" : "Pay with JazzCash"}
          onPress={
            ref
              ? async () => {
                  try {
                    const r = await api.get(`/payments/${ref}/status`);
                    setStatus(r.data.status);
                    if (r.data.status === "paid") {
                      clear();
                      navigation.replace("Order Confirmation", {
                        orderId: route.params.orderId,
                        total: route.params.total,
                      });
                    }
                  } catch (e) {
                    Alert.alert("Status check", apiError(e));
                  }
                }
              : initiate
          }
          loading={busy}
        />
        <Text style={s.secureNote}>
          🔒 100% secure payment • Never share your OTP
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  jazzHero: {
    backgroundColor: "#FFF2C7",
    borderRadius: 22,
    padding: 22,
    marginBottom: 14,
  },
  jazzLogo: { fontSize: 30, fontWeight: "900", color: "#E22B22" },
  jazzSecure: {
    color: theme.colors.success,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "900",
    color: theme.colors.text,
    marginBottom: 8,
  },
  payAmount: {
    fontSize: 34,
    fontWeight: "900",
    color: theme.colors.primary,
    marginVertical: 8,
  },
  ref: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    fontSize: 15,
    marginVertical: 8,
    color: theme.colors.text,
  },
  secureNote: {
    textAlign: "center",
    color: theme.colors.muted,
    fontSize: 12,
    marginTop: 15,
  },
});
