import React, { useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { theme } from "../theme/theme";
import { money, sizeLabel } from "../utils/format";

export const Button = ({
  title,
  onPress,
  disabled = false,
  secondary = false,
  danger = false,
  loading = false,
  icon,
}) => (
  <Pressable
    disabled={disabled || loading}
    onPress={onPress}
    style={({ pressed }) => [
      s.btn,
      secondary && s.btnSecondary,
      danger && s.btnDanger,
      (disabled || loading) && s.disabled,
      pressed && s.pressed,
    ]}
  >
    {loading ? (
      <ActivityIndicator color={secondary ? theme.colors.primary : "#fff"} />
    ) : (
      <>
        <Text
          style={[
            s.btnText,
            secondary && s.btnSecondaryText,
            danger && s.btnDangerText,
          ]}
        >
          {icon ? `${icon}  ` : ""}
          {title}
        </Text>
      </>
    )}
  </Pressable>
);
export const Input = ({ label, error, style, ...props }) => (
  <View style={s.inputWrap}>
    {label && <Text style={s.inputLabel}>{label}</Text>}
    <TextInput
      placeholderTextColor={theme.colors.muted}
      style={[s.input, error && s.inputError, style]}
      {...props}
    />
    {error && <Text style={s.error}>{error}</Text>}
  </View>
);
export const Card = ({ children, style, accent = false }) => (
  <View style={[s.card, accent && s.accentCard, style]}>{children}</View>
);
export const SectionTitle = ({ title, action, onPress }) => (
  <View style={s.sectionRow}>
    <Text style={s.sectionTitle}>{title}</Text>
    {action && (
      <Pressable onPress={onPress}>
        <Text style={s.action}>{action}</Text>
      </Pressable>
    )}
  </View>
);
export const Loader = ({ label = "Loading..." }) => (
  <View style={s.loader}>
    <ActivityIndicator size="large" color={theme.colors.primary} />
    <Text style={s.loaderText}>{label}</Text>
  </View>
);
export const Empty = ({ text, icon = "🛒" }) => (
  <View style={s.empty}>
    <Text style={s.emptyIcon}>{icon}</Text>
    <Text style={s.emptyTitle}>{text}</Text>
  </View>
);
export const IconButton = ({ icon, onPress, badge, accessibilityLabel }) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    style={s.iconButton}
  >
    <Text style={s.iconText}>{icon}</Text>
    {badge > 0 && (
      <View style={s.badge}>
        <Text style={s.badgeText}>{badge}</Text>
      </View>
    )}
  </Pressable>
);
export const Header = ({ title, subtitle, onBack, right }) => (
  <View style={s.header}>
    <View style={s.headerLeft}>
      {onBack && <IconButton icon="‹" onPress={onBack} />}
      <View>
        <Text style={s.headerTitle}>{title}</Text>
        {subtitle && <Text style={s.headerSub}>{subtitle}</Text>}
      </View>
    </View>
    {right}
  </View>
);
export const Pill = ({ children, tone = "green" }) => (
  <View
    style={[
      s.pill,
      tone === "red" && s.pillRed,
      tone === "amber" && s.pillAmber,
    ]}
  >
    <Text
      style={[
        s.pillText,
        tone === "red" && s.pillRedText,
        tone === "amber" && s.pillAmberText,
      ]}
    >
      {children}
    </Text>
  </View>
);
export const ProductCard = ({ product, onPress, onAdd }) => {
  const toastAnim = useRef(new Animated.Value(0)).current;
  const addToCart = async () => {
    await onAdd?.();
    toastAnim.stopAnimation();
    toastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(toastAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.delay(1300),
      Animated.timing(toastAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.product, pressed && s.pressed]}
    >
      <View style={s.productImageWrap}>
        <Image source={{ uri: product.image_url }} style={s.productImage} />
        {product.stock_quantity <= 0 && (
          <View style={s.outBadge}>
            <Text style={s.outBadgeText}>OUT OF STOCK</Text>
          </View>
        )}
      </View>
      <Text style={s.productName} numberOfLines={1}>
        {product.name}
      </Text>
      <Text style={s.productUnit}>
        {money(product.base_price)} / {product.unit_type}
      </Text>
      <View style={s.productBottom}>
        <Text style={s.inStock}>
          {product.stock_quantity > 0 ? "In stock" : "Unavailable"}
        </Text>
        <Pressable
          disabled={!product.stock_quantity}
          onPress={addToCart}
          style={[s.addButton, !product.stock_quantity && s.disabled]}
        >
          <Text style={s.addText}>+</Text>
        </Pressable>
      </View>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            left: 8,
            right: 8,
            bottom: 8,
            backgroundColor: theme.colors.primaryDark,
            borderRadius: 12,
            paddingVertical: 9,
            paddingHorizontal: 8,
            alignItems: "center",
            zIndex: 10,
            elevation: 10,
          },
          {
            opacity: toastAnim,
            transform: [
              {
                translateY: toastAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [20, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Text
          style={{ color: theme.colors.white, fontSize: 12, fontWeight: "800" }}
        >
          ✓ Product added to cart
        </Text>
      </Animated.View>
    </Pressable>
  );
};
export const Qty = ({ value, onMinus, onPlus }) => (
  <View style={s.qty}>
    <Pressable onPress={onMinus} style={s.qtyBtn}>
      <Text style={s.qtyBtnText}>−</Text>
    </Pressable>
    <Text style={s.qtyValue}>{value}</Text>
    <Pressable onPress={onPlus} style={s.qtyBtn}>
      <Text style={s.qtyBtnText}>+</Text>
    </Pressable>
  </View>
);
export const SummaryRow = ({
  label,
  value,
  strong = false,
  green = false,
  currency = "Rs.",
}) => (
  <View style={s.summaryRow}>
    <Text style={[s.summaryLabel, strong && s.strong]}>{label}</Text>
    <Text style={[s.summaryValue, strong && s.strong, green && s.green]}>
      {typeof value === "number" ? money(value, currency) : value}
    </Text>
  </View>
);
export const StatusPill = ({ status }) => {
  const text = String(status || "").replaceAll("_", " ");
  const tone =
    status === "cancelled"
      ? "red"
      : status === "delivered"
        ? "green"
        : status === "out_for_delivery"
          ? "amber"
          : "green";
  return <Pill tone={tone}>{text.toUpperCase()}</Pill>;
};
export const Divider = () => <View style={s.divider} />;

const s = StyleSheet.create({
  btn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    minHeight: 52,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    ...theme.shadow,
  },
  btnSecondary: { backgroundColor: theme.colors.primarySoft, shadowOpacity: 0 },
  btnDanger: { backgroundColor: theme.colors.danger, shadowOpacity: 0 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  btnSecondaryText: { color: theme.colors.primaryDark },
  btnDangerText: { color: "#fff" },
  inputWrap: { marginBottom: 10 },
  inputLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: theme.colors.text,
    marginBottom: 7,
  },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    paddingHorizontal: 15,
    height: 52,
    fontSize: 15,
    color: theme.colors.text,
  },
  inputError: { borderColor: theme.colors.danger },
  error: { fontSize: 12, color: theme.colors.danger, marginTop: 4 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  accentCard: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: "#CDEDD9",
  },
  sectionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 22,
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 19, fontWeight: "900", color: theme.colors.text },
  action: { color: theme.colors.primary, fontWeight: "800" },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  loaderText: { color: theme.colors.muted, marginTop: 10 },
  empty: { alignItems: "center", justifyContent: "center", padding: 50 },
  emptyIcon: { fontSize: 42, marginBottom: 10 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: theme.colors.text,
    textAlign: "center",
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  iconText: { fontSize: 24, color: theme.colors.text, lineHeight: 26 },
  badge: {
    position: "absolute",
    right: -2,
    top: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#fff", fontSize: 10, fontWeight: "900" },
  header: {
    height: 86,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 20,
    backgroundColor: theme.colors.background,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  headerTitle: { fontSize: 21, fontWeight: "900", color: theme.colors.text },
  headerSub: { fontSize: 12, color: theme.colors.muted, marginTop: 2 },
  pill: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillRed: { backgroundColor: theme.colors.dangerSoft },
  pillAmber: { backgroundColor: theme.colors.warningSoft },
  pillText: {
    color: theme.colors.primaryDark,
    fontWeight: "900",
    fontSize: 10,
  },
  pillRedText: { color: theme.colors.danger },
  pillAmberText: { color: "#9A6500" },
  product: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flex: 1,
    minWidth: 0,
    ...theme.shadow,
  },
  productImageWrap: {
    height: 140,
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: theme.colors.primarySoft,
    position: "relative",
  },
  productImage: { width: "100%", height: "100%" },
  outBadge: {
    position: "absolute",
    bottom: 7,
    left: 7,
    right: 7,
    backgroundColor: "rgba(217,45,32,.9)",
    borderRadius: 8,
    padding: 5,
  },
  outBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    textAlign: "center",
  },
  productName: {
    fontSize: 15,
    fontWeight: "900",
    color: theme.colors.text,
    marginTop: 9,
  },
  productUnit: { fontSize: 12, color: theme.colors.muted, marginTop: 3 },
  productBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 9,
  },
  inStock: { fontSize: 11, color: theme.colors.success, fontWeight: "700" },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  addText: { fontSize: 24, color: "#fff", lineHeight: 26 },
  qty: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 13,
    backgroundColor: "#fff",
  },
  qtyBtn: {
    width: 36,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnText: { fontSize: 20, color: theme.colors.text },
  qtyValue: {
    minWidth: 28,
    textAlign: "center",
    fontWeight: "900",
    color: theme.colors.text,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 7,
  },
  summaryLabel: { fontSize: 14, color: theme.colors.muted },
  summaryValue: { fontSize: 14, color: theme.colors.text, fontWeight: "700" },
  strong: { fontSize: 17, fontWeight: "900", color: theme.colors.text },
  green: { color: theme.colors.primaryDark },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 10,
  },
  product: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flex: 1,
    minWidth: 0,
    ...theme.shadow,
  },
  productImageWrap: {
    height: 140,
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: theme.colors.primarySoft,
    position: "relative",
  },
  productImage: { width: "100%", height: "100%" },
  outBadge: {
    position: "absolute",
    bottom: 7,
    left: 7,
    right: 7,
    backgroundColor: "rgba(217,45,32,.9)",
    borderRadius: 8,
    padding: 5,
  },
  outBadgeText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "900",
    textAlign: "center",
  },
  productName: {
    fontSize: 15,
    fontWeight: "900",
    color: theme.colors.text,
    marginTop: 9,
  },
  productUnit: { fontSize: 12, color: theme.colors.muted, marginTop: 3 },
  productBottom: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 9,
  },
  inStock: { fontSize: 11, color: theme.colors.success, fontWeight: "700" },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  addText: { fontSize: 24, color: "#fff", lineHeight: 26 },
  cartToast: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: 8,
    backgroundColor: "#202522",
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: "center",
    zIndex: 10,
    elevation: 10,
  },
  cartToastText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  qty: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 13,
    backgroundColor: "#fff",
  },
  qtyBtn: {
    width: 36,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyBtnText: { fontSize: 20, color: theme.colors.text },
  qtyValue: {
    minWidth: 28,
    textAlign: "center",
    fontWeight: "900",
    color: theme.colors.text,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 7,
  },
  summaryLabel: { fontSize: 14, color: theme.colors.muted },
  summaryValue: { fontSize: 14, color: theme.colors.text, fontWeight: "700" },
  strong: { fontSize: 17, fontWeight: "900", color: theme.colors.text },
  green: { color: theme.colors.primaryDark },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 10,
  },
});
