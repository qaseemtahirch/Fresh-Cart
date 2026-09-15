import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  IconButton,
  Input,
  SectionTitle,
  StatusPill,
} from "../components/UI";
import {
  screen,
  pad,
  dateISO,
  timeLabel,
} from "../utils/screenHelpers";

export function AdminTimeSlotsScreen() {
  const [date, setDate] = useState(dateISO());
  const [slots, setSlots] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [start, setStart] = useState("13:00");
  const [end, setEnd] = useState("14:00");
  const [maxOrders, setMaxOrders] = useState("10");
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    try {
      setLoading(true);

      const response = await api.get("/admin/time-slots");

      setSlots(
        (response.data || []).filter(
          (slot) => !date || slot.date === date,
        ),
      );
    } catch (e) {
      Alert.alert("Slots", apiError(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [date]);

  const editSlot = (slot) => {
    setEditingId(slot.id);
    setStart(slot.start_time.slice(0, 5));
    setEnd(slot.end_time.slice(0, 5));
    setMaxOrders(String(slot.max_orders || 10));
    setIsActive(slot.is_active !== false);
  };

  const resetForm = () => {
    setEditingId(null);
    setStart("13:00");
    setEnd("14:00");
    setMaxOrders("10");
    setIsActive(true);
  };

  const deleteSlot = (slot) => {
    Alert.alert(
      "Delete time slot",
      "This cannot be undone for an unused slot.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              setDeletingId(slot.id);

              await api.delete(`/admin/time-slots/${slot.id}`);

              if (editingId === slot.id) {
                resetForm();
              }

              await load();
            } catch (e) {
              Alert.alert("Delete time slot", apiError(e));
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  const saveSlot = async () => {
    const payload = {
      slot_date: date,
      start_time: start,
      end_time: end,
      max_orders: Number(maxOrders),
      is_active: isActive,
    };

    if (!payload.max_orders || payload.max_orders < 1) {
      Alert.alert(
        "Time slot",
        "Maximum orders must be at least 1.",
      );
      return;
    }

    try {
      setSaving(true);

      if (editingId) {
        await api.put(
          `/admin/time-slots/${editingId}`,
          payload,
        );
      } else {
        await api.post("/admin/time-slots", payload);
      }

      resetForm();
      await load();
    } catch (e) {
      Alert.alert(
        editingId ? "Update slot" : "Save slot",
        apiError(e),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={screen} contentContainerStyle={pad}>
      <Header title="Time slots" subtitle="Capacity management" />

      <Input
        label="Date"
        value={date}
        onChangeText={setDate}
      />

      {loading ? (
        <View style={s.loadingContainer}>
          <ActivityIndicator
            size="large"
            color={theme.colors.primaryDark}
          />
          <Text style={s.loadingText}>
            Loading time slots...
          </Text>
        </View>
      ) : (
        <>
          {slots.map((x) => {
            const isDeleting = deletingId === x.id;

            return (
              <Card key={x.id} style={s.slotAdmin}>
                <View style={s.slotClock}>
                  <Text>◷</Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={s.name}>
                    {timeLabel(x.start_time)} –{" "}
                    {timeLabel(x.end_time)}
                  </Text>

                  <Text style={s.muted}>
                    {x.booked_orders} / {x.max_orders} booked
                  </Text>
                </View>

                {x.booked_orders >= x.max_orders ? (
                  <StatusPill status="cancelled" />
                ) : (
                  <Text style={s.stockGood}>OPEN</Text>
                )}

                <View style={s.actions}>
                  {isDeleting ? (
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.danger}
                    />
                  ) : (
                    <>
                      <IconButton
                        icon="✎"
                        accessibilityLabel="Edit time slot"
                        onPress={() => editSlot(x)}
                        disabled={deletingId !== null}
                      />

                      <IconButton
                        icon="⌫"
                        accessibilityLabel="Delete time slot"
                        onPress={() => deleteSlot(x)}
                        disabled={deletingId !== null}
                      />
                    </>
                  )}
                </View>
              </Card>
            );
          })}

          {slots.length === 0 && (
            <View style={s.emptyContainer}>
              <Text style={s.emptyText}>
                No time slots found for this date.
              </Text>
            </View>
          )}
        </>
      )}

      <SectionTitle
        title={editingId ? "Update slot" : "Create slot"}
      />

      <View style={s.twoInputs}>
        <Input
          label="Start"
          value={start}
          onChangeText={(value) => {
            setStart(value);

            const [hour, minute] = value
              .split(":")
              .map(Number);

            if (
              !Number.isNaN(hour) &&
              !Number.isNaN(minute)
            ) {
              setEnd(
                `${String((hour + 1) % 24).padStart(
                  2,
                  "0",
                )}:${String(minute).padStart(2, "0")}`,
              );
            }
          }}
          style={{ flex: 1 }}
        />

        <Input
          label="End (1 hour)"
          value={end}
          editable={false}
          style={{ flex: 1 }}
        />
      </View>

      <Input
        label="Maximum orders"
        value={maxOrders}
        onChangeText={setMaxOrders}
        keyboardType="number-pad"
      />

      <Button
        secondary
        title={isActive ? "Active slot" : "Inactive slot"}
        onPress={() => setIsActive((value) => !value)}
        disabled={saving}
      />

      <Button
        title={
          saving
            ? editingId
              ? "Updating time slot..."
              : "Creating time slot..."
            : editingId
              ? "Update time slot"
              : "Create time slot"
        }
        onPress={saveSlot}
        disabled={saving}
      />

      {saving && (
        <View style={s.actionLoading}>
          <ActivityIndicator
            size="small"
            color={theme.colors.primaryDark}
          />
          <Text style={s.actionLoadingText}>
            {editingId
              ? "Updating time slot..."
              : "Creating time slot..."}
          </Text>
        </View>
      )}

      {editingId && (
        <Button
          secondary
          title="Cancel edit"
          onPress={resetForm}
          disabled={saving}
        />
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  slotAdmin: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 9,
  },

  slotClock: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
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

  stockGood: {
    color: theme.colors.success,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 5,
  },

  twoInputs: {
    flexDirection: "row",
    gap: 10,
  },

  actions: {
    marginLeft: 8,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 70,
    justifyContent: "flex-end",
  },

  loadingContainer: {
    minHeight: 220,
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

  actionLoading: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 4,
    marginBottom: 10,
  },

  actionLoadingText: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.muted,
  },

  emptyContainer: {
    paddingVertical: 25,
    alignItems: "center",
  },

  emptyText: {
    color: theme.colors.muted,
    fontSize: 14,
    fontWeight: "600",
  },
});