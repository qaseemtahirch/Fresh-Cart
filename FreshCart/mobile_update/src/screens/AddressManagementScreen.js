import React, { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import { api, apiError } from "../services/api";
import { theme } from "../theme/theme";
import { Button, Card, Header, Input, SectionTitle } from "../components/UI";
import {
  screen,
  pad,
} from "../utils/screenHelpers";

export function AddressManagementScreen({ navigation }) {
  const [a, setA] = useState([]),
    [label, setLabel] = useState("Home"),
    [line, setLine] = useState(""),
    [lat, setLat] = useState("30.6682"),
    [lng, setLng] = useState("73.1114"),
    [editing, setEditing] = useState(null);
  const load = () =>
    api
      .get("/addresses")
      .then((r) => setA(r.data || []))
      .catch((e) => Alert.alert("Addresses", apiError(e)));
  useEffect(() => {
    load();
  }, []);
  const gps = async () => {
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.status !== "granted") throw Error("Location permission denied.");
      const l = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLat(String(l.coords.latitude));
      setLng(String(l.coords.longitude));
      Alert.alert(
        "Location captured",
        "Your current GPS coordinates have been added.",
      );
    } catch (e) {
      Alert.alert("GPS", e.message);
    }
  };
  const save = async () => {
    try {
      const addressLine = line.trim();
      if (!addressLine) {
        Alert.alert("Address", "Please enter your street, house, or area.");
        return;
      }
      const body = {
        label,
        address_line: addressLine,
        latitude: Number(lat),
        longitude: Number(lng),
        is_default: a.length === 0,
      };
      if (editing) await api.put(`/addresses/${editing}`, body);
      else await api.post("/addresses", body);
      setLine("");
      setEditing(null);
      load();
    } catch (e) {
      Alert.alert("Address", apiError(e));
    }
  };
  const edit = (x) => {
    setEditing(x.id);
    setLabel(x.label);
    setLine(x.address_line);
    setLat(String(x.latitude));
    setLng(String(x.longitude));
  };
  return (
    <View style={screen}>
      <Header
        title="Delivery addresses"
        subtitle="Saved locations"
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={pad}>
        {a.map((x) => (
          <Card key={x.id} style={{ marginBottom: 10 }}>
            <View style={s.row}>
              <View style={s.addressIcon}>
                <Text>{x.label === "Work" ? "💼" : "⌂"}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.row}>
                  <Text style={s.name}>{x.label || "Home"}</Text>
                  {x.is_default && <Text style={s.defaultText}>DEFAULT</Text>}
                </View>
                <Text style={s.muted}>{x.address_line}</Text>
                <Text style={s.muted}>{x.city || "City"}</Text>
              </View>
            </View>
            <View style={s.addressActions}>
              <Button secondary title="Edit" onPress={() => edit(x)} />
              <Button
                danger
                title="Delete"
                onPress={() =>
                  Alert.alert("Delete address?", "This cannot be undone.", [
                    { text: "Cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: async () => {
                        try {
                          await api.delete(`/addresses/${x.id}`);
                          load();
                        } catch (e) {
                          Alert.alert("Error", apiError(e));
                        }
                      },
                    },
                  ])
                }
              />
            </View>
          </Card>
        ))}
        <SectionTitle title={editing ? "Edit address" : "Add new address"} />
        <Input
          label="Label"
          value={label}
          onChangeText={setLabel}
          placeholder="Home"
        />
        <Input
          label="Address"
          value={line}
          onChangeText={setLine}
          placeholder="Street, house, area"
          multiline
        />
        <View style={s.twoInputs}>
          <Input
            label="Latitude"
            value={lat}
            onChangeText={setLat}
            keyboardType="decimal-pad"
            style={{ flex: 1 }}
          />
          <Input
            label="Longitude"
            value={lng}
            onChangeText={setLng}
            keyboardType="decimal-pad"
            style={{ flex: 1 }}
          />
        </View>
        <Button
          secondary
          title="Use current GPS location"
          icon="📍"
          onPress={gps}
        />
        <Button
          title={editing ? "Update address" : "Save address"}
          onPress={save}
        />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  addressActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  addressIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  defaultText: { fontSize: 9, color: theme.colors.primary, fontWeight: "900" },
  twoInputs: { flexDirection: "row", gap: 10 },
});
