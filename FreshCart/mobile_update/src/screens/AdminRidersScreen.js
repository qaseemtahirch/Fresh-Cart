import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api, apiError } from "../services/api";
import { theme } from "../theme/theme";
import {
  Button,
  Card,
  Header,
  Input,
  SectionTitle,
  StatusPill,
} from "../components/UI";
import { screen, pad, dateISO, initials } from "../utils/screenHelpers";

export function AdminRidersScreen() {
  const [r, setR] = useState([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicleType, setVehicleType] = useState("Bike");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [slotOptions, setSlotOptions] = useState([]);
  const [assignedSlots, setAssignedSlots] = useState({});
  const [openRider, setOpenRider] = useState(null);

  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [updatingRider, setUpdatingRider] = useState(null);
  const [loadingAssignments, setLoadingAssignments] = useState(null);
  const [savingAssignments, setSavingAssignments] = useState(null);

  const load = async () => {
    try {
      setLoading(true);

      const [riders, slots] = await Promise.all([
        api.get("/admin/riders"),
        api.get("/admin/time-slots/availability", {
          params: { date: dateISO() },
        }),
      ]);

      setR(riders.data || []);
      setSlotOptions(slots.data || []);
    } catch (e) {
      Alert.alert("Riders", apiError(e));
    } finally {
      setLoading(false);
    }
  };

  const loadAssignments = async (riderId) => {
    try {
      setLoadingAssignments(riderId);

      const response = await api.get(`/admin/riders/${riderId}/time-slots`, {
        params: { date: dateISO() },
      });

      setAssignedSlots((current) => ({
        ...current,
        [riderId]: (response.data || [])
          .filter((slot) => slot.assigned)
          .map((slot) => slot.id),
      }));
    } catch (e) {
      Alert.alert("Rider slots", apiError(e));
    } finally {
      setLoadingAssignments(null);
    }
  };

  const saveAssignments = async (riderId) => {
    try {
      setSavingAssignments(riderId);

      await api.put(
        `/admin/riders/${riderId}/time-slots`,
        {
          time_slot_ids: assignedSlots[riderId] || [],
        },
        {
          params: { date: dateISO() },
        },
      );

      Alert.alert(
        "Assignments saved",
        "The rider's delivery slots were updated.",
      );

      await load();
    } catch (e) {
      Alert.alert("Save assignments", apiError(e));
    } finally {
      setSavingAssignments(null);
    }
  };

  const updateAvailability = async (x) => {
    try {
      setUpdatingRider(x.id);

      await api.put(`/admin/riders/${x.id}`, {
        name: x.name,
        email: x.email,
        phone: x.phone,
        vehicle_type: x.vehicle_type || x.vehicle || "Bike",
        vehicle_number: x.vehicle_number || "",
        is_active: x.is_active,
        is_available: !x.is_available,
      });

      await load();
    } catch (e) {
      Alert.alert("Update rider", apiError(e));
    } finally {
      setUpdatingRider(null);
    }
  };

  const addRider = async () => {
    const riderName = name.trim();
    const riderEmail = email.trim().toLowerCase();
    const riderPassword = password.trim();

    if (
      !riderName ||
      !riderEmail ||
      !riderEmail.includes("@") ||
      riderPassword.length < 8
    ) {
      Alert.alert(
        "Rider details",
        "Enter a name, valid email, and password with at least 8 characters.",
      );
      return;
    }

    try {
      setAdding(true);

      await api.post("/admin/riders", {
        name: riderName,
        email: riderEmail,
        phone,
        password: riderPassword,
        vehicle_type: vehicleType,
        vehicle_number: vehicleNumber,
        is_active: true,
        is_available: true,
      });

      setName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setVehicleNumber("");

      await load();
    } catch (e) {
      Alert.alert("Add rider", apiError(e));
    } finally {
      setAdding(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <ScrollView style={screen} contentContainerStyle={pad}>
      <Header title="Riders" subtitle="Delivery team" />

      {loading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={theme.colors.primaryDark}
          />
          <Text style={s.loadingText}>Loading riders...</Text>
        </View>
      ) : (
        <>
          {r.map((x) => {
            const isUpdating = updatingRider === x.id;
            const isLoadingSlots = loadingAssignments === x.id;
            const isSavingSlots = savingAssignments === x.id;

            return (
              <Card key={x.id} style={{ marginBottom: 10 }}>
                <View style={s.row}>
                  <View style={s.riderAvatar}>
                    <Text>{initials(x.name)}</Text>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>{x.name}</Text>
                    <Text style={s.muted}>{x.email}</Text>

                    <Text style={s.muted}>
                      {x.vehicle_type || x.vehicle || "Bike"}{" "}
                      {x.vehicle_number || ""} •{" "}
                      {x.is_available ? "Available" : "Unavailable"}
                    </Text>

                    <Text style={s.muted}>
                      {x.active_orders || 0} active orders
                    </Text>
                  </View>

                  <View>
                    <StatusPill
                      status={x.is_active ? "confirmed" : "cancelled"}
                    />
                  </View>
                </View>

                <Button
                  secondary
                  title={
                    isUpdating
                      ? "Updating..."
                      : x.is_available
                        ? "Set unavailable"
                        : "Set available"
                  }
                  onPress={() => updateAvailability(x)}
                  disabled={isUpdating}
                />

                {isUpdating && (
                  <View style={s.actionLoading}>
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.primaryDark}
                    />
                    <Text style={s.actionLoadingText}>
                      Updating rider...
                    </Text>
                  </View>
                )}

                <Button
                  secondary
                  title={
                    openRider === x.id
                      ? "Hide today’s slots"
                      : "Select today’s slots"
                  }
                  onPress={async () => {
                    const next = openRider === x.id ? null : x.id;

                    setOpenRider(next);

                    if (
                      next &&
                      assignedSlots[x.id] === undefined
                    ) {
                      await loadAssignments(x.id);
                    }
                  }}
                  disabled={isLoadingSlots}
                />

                {openRider === x.id && (
                  <View style={{ marginTop: 8 }}>
                    {isLoadingSlots ? (
                      <View style={s.slotsLoading}>
                        <ActivityIndicator
                          size="small"
                          color={theme.colors.primaryDark}
                        />
                        <Text style={s.actionLoadingText}>
                          Loading today's slots...
                        </Text>
                      </View>
                    ) : (
                      <>
                        {slotOptions.map((slot) => {
                          const checked = (
                            assignedSlots[x.id] || []
                          ).includes(slot.slot_id);

                          const assignedToOther =
                            slot.assigned_rider &&
                            slot.assigned_rider.id !== x.id;

                          const disabled =
                            assignedToOther || !slot.is_active;

                          return (
                            <Pressable
                              key={slot.slot_id}
                              disabled={disabled}
                              style={[
                                s.option,
                                checked && s.optionSelected,
                                disabled && { opacity: 0.45 },
                              ]}
                              onPress={() =>
                                setAssignedSlots((current) => ({
                                  ...current,
                                  [x.id]: checked
                                    ? (current[x.id] || []).filter(
                                        (id) => id !== slot.slot_id,
                                      )
                                    : [
                                        ...(current[x.id] || []),
                                        slot.slot_id,
                                      ],
                                }))
                              }
                            >
                              <Text style={{ marginRight: 10 }}>
                                {assignedToOther
                                  ? "🔒"
                                  : checked
                                    ? "☑"
                                    : "☐"}
                              </Text>

                              <Text style={s.name}>
                                {slot.time}
                                {slot.assigned_rider
                                  ? ` — Assigned to ${slot.assigned_rider.name}`
                                  : !slot.is_active
                                    ? " — Inactive"
                                    : ""}
                              </Text>
                            </Pressable>
                          );
                        })}

                        <Button
                          title={
                            isSavingSlots
                              ? "Saving assignment..."
                              : "Save assignment"
                          }
                          onPress={() => saveAssignments(x.id)}
                          disabled={isSavingSlots}
                        />

                        {isSavingSlots && (
                          <View style={s.actionLoading}>
                            <ActivityIndicator
                              size="small"
                              color={theme.colors.primaryDark}
                            />
                            <Text style={s.actionLoadingText}>
                              Saving assignment...
                            </Text>
                          </View>
                        )}
                      </>
                    )}
                  </View>
                )}
              </Card>
            );
          })}

          <SectionTitle title="Add rider" />

          <Input
            label="Name"
            placeholder="Ali Raza"
            value={name}
            onChangeText={setName}
          />

          <Input
            label="Email"
            placeholder="rider@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Input
            label="Phone"
            placeholder="0300 1234567"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          <Input
            label="Password"
            placeholder="At least 8 characters"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <Input
            label="Vehicle type"
            placeholder="Bike"
            value={vehicleType}
            onChangeText={setVehicleType}
          />

          <Input
            label="Vehicle number"
            placeholder="ABC-123"
            value={vehicleNumber}
            onChangeText={setVehicleNumber}
          />

          <Button
            title={adding ? "Adding rider..." : "Add rider"}
            onPress={addRider}
            disabled={adding}
          />

          {adding && (
            <View style={s.addingContainer}>
              <ActivityIndicator
                size="small"
                color={theme.colors.primaryDark}
              />
              <Text style={s.addingText}>Adding rider...</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  riderAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },

  name: {
    fontSize: 15,
    fontWeight: "800",
    color: theme.colors.text,
  },

  muted: {
    color: theme.colors.muted,
    fontSize: 13,
    marginTop: 3,
  },

  option: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 9,
    flexDirection: "row",
    alignItems: "center",
  },

  optionSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },

  loadingContainer: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },

  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.text,
  },

  slotsLoading: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },

  actionLoading: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },

  actionLoadingText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.muted,
  },

  addingContainer: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    marginBottom: 10,
  },

  addingText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.muted,
  },
});