import React, { useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import {
  Alert,
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as Print from "expo-print";
import { api, apiError } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { theme } from "../theme/theme";
import { money, sizeLabel, sizes } from "../utils/format";
import {
  Button,
  Card,
  Divider,
  Empty,
  Header,
  IconButton,
  Input,
  Loader,
  ProductCard,
  Qty,
  SectionTitle,
  StatusPill,
  SummaryRow,
} from "../components/UI";
import Toast from "react-native-toast-message";
import CheckoutRecommendations from "../components/CheckoutRecommendations";

const screen = { backgroundColor: theme.colors.background, flex: 1 };
const pad = { padding: 16 };
const fmtStatus = (s) => String(s || "pending").replaceAll("_", " ");
const safe = (v, f = "") => (v === undefined || v === null ? f : v);

const getKarachiNow = () => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const value = (type) => parts.find((x) => x.type === type)?.value || "00";

  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
};

const dateISO = () => getKarachiNow().date;

// Only poll while an order screen is visible. This keeps assignments and status
// changes synchronized across separate customer, rider, and admin devices.
const useOrderSync = (load) => {
  useFocusEffect(
    React.useCallback(() => {
      load(false);
      const timer = setInterval(() => load(true), 3000);
      return () => clearInterval(timer);
    }, [load]),
  );
};

const useKarachiClock = () => {
  const [now, setNow] = useState(getKarachiNow());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(getKarachiNow());
    }, 30000);

    return () => clearInterval(timer);
  }, []);

  return now;
};

const slotStartMinutes = (slot) => {
  const [hour, minute] = String(slot?.start_time || "").split(":");
  return Number(hour) * 60 + Number(minute);
};

const isSelectableSlot = (slot, now) =>
  !!slot &&
  slot.slot_date === now.date &&
  slot.is_active !== false &&
  Number(slot.booked_orders || 0) < Number(slot.max_orders || 0) &&
  slotStartMinutes(slot) > now.minutes;

const initials = (name) =>
  String(name || "F")
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const timeLabel = (t) => {
  const value = String(t || "").slice(0, 5);
  const [hour, minute] = value.split(":").map(Number);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return value;
  }

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${String(minute).padStart(2, "0")} ${suffix}`;
};

export const SplashScreen = () => (
  <View style={s.splash}>
    <View style={s.logoMark}>
      <Text style={s.logoLeaf}>✓</Text>
    </View>
    <Text style={s.logo}>FreshCart</Text>
    <Text style={s.splashSub}>Fresh groceries. Fast delivery.</Text>
  </View>
);

export function LocationPermissionScreen({ navigation }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    try {
      setBusy(true);
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.status !== "granted") {
        Alert.alert(
          "Location access",
          "Location permission is optional. You can continue without it.",
        );
        return;
      }
      navigation.replace("Login");
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={s.onboard}>
      <View style={s.locationArt}>
        <Text style={s.locationPin}>⌖</Text>
      </View>
      <Text style={s.kicker}>WELCOME TO FRESHCART</Text>
      <Text style={s.h1}>Fresh groceries,{`\n`}right at your doorstep.</Text>
      <Text style={s.p}>
        Allow location access if you want to use local delivery details or keep
        browsing without it.
      </Text>
      <View style={s.infoRow}>
        <View style={s.infoIcon}>
          <Text>📍</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.name}>Location access</Text>
          <Text style={s.muted}>
            Optional for convenience, not a service-area restriction.
          </Text>
        </View>
      </View>
      <Button title="Allow location" onPress={go} loading={busy} />
      <Button
        secondary
        title="Continue without checking"
        onPress={() => navigation.replace("Login")}
      />
    </View>
  );
}

export const ServiceUnavailableScreen = ({ navigation }) => (
  <View style={s.onboard}>
    <View style={s.warningArt}>
      <Text style={s.warningIcon}>📍</Text>
    </View>
    <Text style={s.h1}>Location is optional</Text>
    <Text style={s.p}>
      FreshCart is available for supported delivery areas, and you can keep
      browsing even if location is unavailable.
    </Text>
    <Card accent>
      <Text style={s.name}>Delivery support</Text>
      <Text style={s.muted}>
        You can continue shopping and add a delivery address later.
      </Text>
    </Card>
    <Button title="Back to login" onPress={() => navigation.replace("Login")} />
  </View>
);

export function LoginScreen({ navigation }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("customer@freshcart.local"),
    [password, setPassword] = useState("FreshCart123!"),
    [busy, setBusy] = useState(false);
  const submit = async () => {
    try {
      setBusy(true);
      await login(email.trim(), password);
    } catch (e) {
      Alert.alert("Login failed", apiError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView
      style={screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={s.auth}>
        <View style={s.authLogo}>
          <View style={s.logoMarkSmall}>
            <Text style={s.logoLeafSmall}>✓</Text>
          </View>
          <Text style={s.brand}>FreshCart</Text>
        </View>
        <Text style={s.h1}>Welcome back 👋</Text>
        <Text style={s.p}>Sign in to continue shopping fresh.</Text>
        <Input
          label="Email address"
          placeholder="you@example.com"
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Input
          label="Password"
          placeholder="••••••••"
          onChangeText={setPassword}
          secureTextEntry
        />
        {busy ? (
          <Loader label="Signing you in..." />
        ) : (
          <Button title="Sign in" onPress={submit} />
        )}
        <Button
          secondary
          title="Create a new account"
          onPress={() => navigation.navigate("Register")}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function RegisterScreen({ navigation }) {
  const { register } = useAuth();
  const [n, setN] = useState(""),
    [e, setE] = useState(""),
    [p, setP] = useState(""),
    [pw, setPw] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!n || !e || !p || pw.length < 8)
      return Alert.alert(
        "Check details",
        "Please enter your name, phone, email and an 8+ character password.",
      );
    try {
      setBusy(true);
      await register({ name: n, email: e, phone: p, password: pw });
    } catch (x) {
      Alert.alert("Registration failed", apiError(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView
      style={screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={s.auth}>
        <Header title="Create account" onBack={() => navigation.goBack()} />
        <Text style={s.h1}>Let's get started</Text>
        <Text style={s.p}>Create your FreshCart account in a few seconds.</Text>
        <Input
          label="Full name"
          placeholder="Enter Your Name"
          value={n}
          onChangeText={setN}
        />
        <Input
          label="Phone number"
          placeholder="0300 1234567"
          value={p}
          onChangeText={setP}
          keyboardType="phone-pad"
        />
        <Input
          label="Email address"
          placeholder="you@example.com"
          value={e}
          onChangeText={setE}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Input
          label="Password"
          placeholder="At least 8 characters"
          value={pw}
          onChangeText={setPw}
          secureTextEntry
        />
        <Button title="Create account" onPress={submit} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const HomeProductCard = ({
  product,
  onPress,
  onAdd,
  alreadyInCart = false,
}) => {
  const available = Number(product.stock_quantity || 0) > 0;

  return (
    <View style={s.homeProductCard}>
      <Pressable onPress={onPress} style={s.homeProductBody}>
        <View style={s.homeProductImageWrap}>
          <Image
            source={{ uri: product.image_url }}
            style={s.homeProductImage}
            resizeMode="contain"
          />
          {!available && (
            <View style={s.homeOutBadge}>
              <Text style={s.homeOutBadgeText}>OUT OF STOCK</Text>
            </View>
          )}
        </View>
        <Text style={s.homeProductName} numberOfLines={2}>
          {product.name}
        </Text>
        <Text style={s.homeProductPrice}>
          {money(product.base_price)}{" "}
          <Text style={s.homeProductUnit}>/ {product.unit_type}</Text>
        </Text>
        <Text style={[s.homeStock, !available && s.homeStockUnavailable]}>
          {available ? "✓ In stock" : "Unavailable"}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add ${product.name} to basket`}
        disabled={!available || alreadyInCart}
        onPress={onAdd}
        style={({ pressed }) => [
          s.homeAddButton,
          (!available || alreadyInCart) && s.homeAddButtonDisabled,
          pressed && available && !alreadyInCart && s.homeAddButtonPressed,
        ]}
      >
        <Text style={s.homeAddButtonText}>
          {!available
            ? "Out of stock"
            : alreadyInCart
              ? "✓ Added to Cart"
              : "+  Add to Cart"}
        </Text>
      </Pressable>
    </View>
  );
};

export function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const [cats, setCats] = useState([]),
    [products, setProducts] = useState([]),
    [loading, setLoading] = useState(true);
  const { add, items, shippingInfo } = useCart();
  useEffect(() => {
    Promise.all([api.get("/categories"), api.get("/products")])
      .then(([a, b]) => {
        setCats(a.data || []);
        setProducts(b.data || []);
      })
      .catch((e) => Alert.alert("Unable to load FreshCart", apiError(e)))
      .finally(() => setLoading(false));
  }, []);
  const check = async () => {
    try {
      const p = await Location.requestForegroundPermissionsAsync();
      if (p.status !== "granted") throw Error("Location permission denied.");
      const l = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      Alert.alert(
        "Location available ✓",
        `FreshCart can use your current location for delivery planning (${l.coords.latitude.toFixed(4)}, ${l.coords.longitude.toFixed(4)}).`,
      );
    } catch (e) {
      Alert.alert("Location check", e.message || apiError(e));
    }
  };
  return (
    <ScrollView
      style={screen}
      contentContainerStyle={s.homeContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.topBar}>
        <Pressable style={s.locationPill} onPress={check}>
          <Text style={s.locationPillIcon}>📍</Text>
          <Text style={s.locationPillText}>Use my location</Text>
          <Text style={s.locationPillArrow}>›</Text>
        </Pressable>
        <View style={s.topActions}>
          <IconButton
            icon="🔔"
            accessibilityLabel="Notifications"
            onPress={() => navigation.navigate("Notifications")}
          />
          <IconButton
            icon="🛒"
            accessibilityLabel="Basket"
            onPress={() => navigation.navigate("Cart")}
            badge={items.reduce((count, item) => count + item.quantity, 0)}
          />
        </View>
      </View>
      <View style={s.greetingBlock}>
        <Text style={s.locationText}>FreshCart delivery</Text>
        <Text style={s.greeting}>Hello, {safe(user?.name, "Ahmed")} 👋</Text>
      </View>
      <View style={s.homePromoBanner}>
        <View style={s.homePromoGlow} />
        <View style={s.homePromoCopy}>
          <Text style={s.homePromoTitle}>
            <Text style={s.homePromoTitleAccent}>Fresh groceries,</Text>
            {`\n`}delivered to your door
          </Text>
          <Text style={s.homePromoDescription}>
            Get fresh products at{`\n`}great prices.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Shop now"
            onPress={() => navigation.navigate("Search")}
            style={({ pressed }) => [
              s.homePromoButton,
              pressed && s.homePromoButtonPressed,
            ]}
          >
            <Text style={s.homePromoButtonText}>Shop Now →</Text>
          </Pressable>
        </View>
        <View style={s.homePromoVisual} pointerEvents="none">
          <Text style={s.homePromoLeafTop}>🌿</Text>
          <View style={s.homePromoProduceTop}>
            <Text style={s.homePromoProduce}>🥬 🥦</Text>
            <Text style={s.homePromoProduce}>🍅 🫑</Text>
          </View>
          <View style={s.homePromoBasket}>
            {products.length ? (
              products
                .slice(0, 4)
                .map((product, index) => (
                  <Image
                    key={product.id}
                    source={{ uri: product.image_url }}
                    style={[
                      s.homePromoBasketImage,
                      [
                        s.homePromoBasketImageOne,
                        s.homePromoBasketImageTwo,
                        s.homePromoBasketImageThree,
                        s.homePromoBasketImageFour,
                      ][index],
                    ]}
                    resizeMode="cover"
                  />
                ))
            ) : (
              <>
                <Text style={s.homePromoBasketProduce}>🍌 🍎</Text>
                <Text style={s.homePromoBasketProduce}>🥒 🥛</Text>
              </>
            )}
          </View>
          <Text style={s.homePromoLeafBottom}>🍃</Text>
        </View>
        <View style={s.homePromoDots}>
          <View style={s.homePromoDotActive} />
          <View style={s.homePromoDot} />
          <View style={s.homePromoDot} />
        </View>
      </View>
      <Pressable
        style={s.searchBar}
        onPress={() => navigation.navigate("Search")}
      >
        <Text style={s.searchIcon}>⌕</Text>
        <Text style={s.searchPlaceholder}>
          Search vegetables, fruits, meat, milk...
        </Text>
      </Pressable>
      <SectionTitle
        title="Shop by category"
        action="See all"
        onPress={() => navigation.navigate("Categories")}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.categoryScrollContent}
      >
        {cats.map((c) => (
          <Pressable
            key={c.id}
            style={s.homeCategoryCard}
            onPress={() =>
              navigation.navigate(c.name, { categoryId: c.id, title: c.name })
            }
          >
            <View style={s.homeCategoryIcon}>
              <Text style={s.homeCategoryIconText}>{c.icon}</Text>
            </View>
            <Text style={s.categoryMiniText}>{c.name}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <SectionTitle
        title="Today's fresh picks"
        action="View all"
        onPress={() => navigation.navigate("Search")}
      />
      {loading ? (
        <Loader label="Finding fresh products..." />
      ) : (
        <View style={s.homeProductGrid}>
          {products.slice(0, 8).map((p) => (
            <HomeProductCard
              key={p.id}
              product={p}
              alreadyInCart={items.some(
                (item) => Number(item.product_id) === Number(p.id),
              )}
              onPress={() =>
                navigation.navigate("Product Details", { productId: p.id })
              }
              onAdd={() => add(p, 500)}
            />
          ))}
        </View>
      )}
      <Card style={s.homeDeliveryCard}>
        <View style={s.deliveryRow}>
          <Text style={s.deliveryTruck}>🚚</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>
              Minimum order{" "}
              {money(
                shippingInfo?.minimum_order ?? 0,
                shippingInfo?.currency || "PKR",
              )}
            </Text>
            <Text style={s.muted}>
              Fast doorstep delivery across supported areas.
            </Text>
          </View>
          <Text style={s.arrow}>›</Text>
        </View>
      </Card>
    </ScrollView>
  );
}

export function CategoriesScreen({ navigation }) {
  const [c, setC] = useState([]);
  useEffect(() => {
    api
      .get("/categories")
      .then((r) => setC(r.data || []))
      .catch((e) => Alert.alert("Error", apiError(e)));
  }, []);
  return (
    <View style={screen}>
      <Header title="Categories" subtitle="Freshness for every meal" />
      <ScrollView contentContainerStyle={pad}>
        {c.map((x) => (
          <Pressable
            key={x.id}
            style={s.categoryWide}
            onPress={() =>
              navigation.navigate(x.name, { categoryId: x.id, title: x.name })
            }
          >
            <View style={s.categoryWideIcon}>
              <Text>{x.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.categoryTitle}>{x.name}</Text>
              <Text style={s.muted}>{x.description}</Text>
            </View>
            <Text style={s.arrow}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export function ProductListScreen({ route, navigation }) {
  const { categoryId, title } = route.params || {};
  const [p, setP] = useState([]);
  const { add } = useCart();
  useEffect(() => {
    api
      .get("/products", { params: { category_id: categoryId } })
      .then((r) => setP(r.data || []))
      .catch((e) => Alert.alert("Error", apiError(e)));
  }, [categoryId]);
  return (
    <View style={screen}>
      <Header
        title={title || "Products"}
        subtitle={`${p.length} fresh products`}
      />
      <FlatList
        data={p}
        numColumns={2}
        keyExtractor={(x) => String(x.id)}
        contentContainerStyle={s.listPad}
        columnWrapperStyle={{ gap: 12 }}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            onPress={() =>
              navigation.navigate("Product Details", { productId: item.id })
            }
            onAdd={() => add(item, 500)}
          />
        )}
        ListEmptyComponent={
          <Empty text="No products found in this category." icon="🥬" />
        }
      />
    </View>
  );
}

export function ProductDetailsScreen({ route, navigation }) {
  const [p, setP] = useState(null),
    [size, setSize] = useState(500);
  const { add } = useCart();
  useEffect(() => {
    api
      .get(`/products/${route.params.productId}`)
      .then((r) => setP(r.data))
      .catch((e) => Alert.alert("Error", apiError(e)));
  }, [route.params.productId]);
  if (!p) return <Loader />;
  const price = (p.base_price * size) / 1000;
  return (
    <View style={screen}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={s.detailImageWrap}>
          <Image source={{ uri: p.image_url }} style={s.detailImage} />
          <View style={s.detailBack}>
            <IconButton icon="‹" onPress={() => navigation.goBack()} />
          </View>
          <View style={s.detailHeart}>
            <IconButton icon="♡" />
          </View>
        </View>
        <View style={s.detailBody}>
          <Text style={s.detailCategory}>
            {p.unit_type === "liter" ? "MILK & DAIRY" : "FRESH PRODUCE"}
          </Text>
          <Text style={s.detailTitle}>{p.name}</Text>
          <Text style={s.detailDesc}>{p.description}</Text>
          <View style={s.detailPriceRow}>
            <Text style={s.detailPrice}>{money(price)}</Text>
            <Text style={s.perLabel}> / {sizeLabel(size, p.unit_type)}</Text>
            <Text style={s.rating}>★ 4.8</Text>
          </View>
          <Divider />
          <Text style={s.label}>Select quantity</Text>
          <View style={s.sizeGrid}>
            {sizes.map((x) => (
              <Pressable
                key={x}
                onPress={() => setSize(x)}
                style={[s.sizeBox, x === size && s.sizeSelected]}
              >
                <Text style={[s.sizeMain, x === size && s.sizeMainSelected]}>
                  {sizeLabel(x, p.unit_type)}
                </Text>
                <Text style={s.sizePrice}>
                  {money((p.base_price * x) / 1000)}
                </Text>
                {x === size && <Text style={s.check}>✓</Text>}
              </Pressable>
            ))}
          </View>
          <Card style={{ marginTop: 16 }}>
            <View style={s.stockRow}>
              <Text style={s.stockDot}>●</Text>
              <View>
                <Text style={s.name}>
                  {p.stock_quantity > 0 ? "In stock" : "Out of stock"}
                </Text>
                <Text style={s.muted}>
                  Base price {money(p.base_price)} / {p.unit_type}
                </Text>
              </View>
            </View>
          </Card>
        </View>
      </ScrollView>
      <View style={s.stickyBar}>
        <View>
          <Text style={s.muted}>Selected</Text>
          <Text style={s.stickyPrice}>{money(price)}</Text>
        </View>
        <Button
          title="Add to cart"
          icon="🛒"
          onPress={() => {
            add(p, size);
            Alert.alert(
              "Added to cart",
              `${p.name} • ${sizeLabel(size, p.unit_type)}`,
            );
          }}
          disabled={!p.stock_quantity}
        />
      </View>
    </View>
  );
}

export function SearchScreen({ navigation }) {
  const [q, setQ] = useState(""),
    [products, setProducts] = useState([]);
  const { add } = useCart();
  useEffect(() => {
    api
      .get("/products")
      .then((r) => setProducts(r.data || []))
      .catch((e) => Alert.alert("Error", apiError(e)));
  }, []);
  const filtered = useMemo(
    () =>
      products.filter((p) =>
        `${p.name} ${p.description}`.toLowerCase().includes(q.toLowerCase()),
      ),
    [products, q],
  );
  return (
    <View style={screen}>
      <Header title="Search" onBack={() => navigation.goBack()} />
      <View style={{ paddingHorizontal: 16 }}>
        <Input
          placeholder="Search fresh groceries..."
          value={q}
          onChangeText={setQ}
          autoFocus
        />
      </View>
      <FlatList
        data={filtered}
        numColumns={2}
        keyExtractor={(x) => String(x.id)}
        contentContainerStyle={s.listPad}
        columnWrapperStyle={{ gap: 12 }}
        renderItem={({ item }) => (
          <ProductCard
            product={item}
            onPress={() =>
              navigation.navigate("Product Details", { productId: item.id })
            }
            onAdd={() => add(item, 500)}
          />
        )}
        ListEmptyComponent={<Empty text="No matching products." icon="⌕" />}
      />
    </View>
  );
}

export function CartScreen({ navigation }) {
  const {
    items,
    change,
    remove,
    subtotal,
    shipping,
    total,
    shippingInfo,
    refreshShipping,
  } = useCart();

  const minimum = Number(shippingInfo?.minimum_order ?? 0);
  const threshold = Number(shippingInfo?.free_shipping_threshold ?? 0);
  const currency = shippingInfo?.currency || "PKR";
  const remaining = Math.max(0, minimum - subtotal);
  const shippingTiers = shippingInfo?.shipping_tiers || [];

  const feeAt = (amount) =>
    Number(
      shippingTiers.find(
        (tier) =>
          amount >= Number(tier.min_amount) &&
          (!Number(tier.max_amount) || amount < Number(tier.max_amount)),
      )?.fee ??
        shippingInfo?.shipping_fee ??
        shipping,
    );

  const deliveryStages = [
    {
      amount: 250,
      fee: feeAt(250),
      color: "#F59E0B",
    },
    {
      amount: 500,
      fee: feeAt(500),
      color: "#3B82F6",
    },
    {
      amount: 1000,
      fee: feeAt(1000),
      color: "#20A464",
    },
  ];

  const activeStage = deliveryStages.reduce(
    (current, stage, index) => (subtotal >= stage.amount ? index : current),
    -1,
  );

  const nextStage = deliveryStages[activeStage + 1];

  const freeShipping =
    shipping === 0 &&
    shippingInfo?.free_shipping_enabled &&
    subtotal >= threshold;

  const deliveryMessage =
    remaining > 0
      ? `Add ${money(remaining, currency)} more to place your order.`
      : freeShipping
        ? "🎉 You unlocked FREE shipping"
        : nextStage
          ? `Add ${money(
              nextStage.amount - subtotal,
              currency,
            )} more to get ${money(nextStage.fee, currency)} shipping`
          : `🎉 You unlocked ${money(
              deliveryStages[2].fee,
              currency,
            )} shipping`;

  useFocusEffect(
    useMemo(
      () => () => {
        refreshShipping().catch(() => {});
      },
      [refreshShipping],
    ),
  );

  return (
    <View style={screen}>
      <Header
        title="My Cart"
        subtitle={`${items.length} item${items.length === 1 ? "" : "s"}`}
      />

      {items.length === 0 ? (
        <Empty text="Your cart is empty. Add something fresh!" icon="🛒" />
      ) : (
        <ScrollView contentContainerStyle={pad}>
          <Card style={s.shippingCard}>
            <View style={s.shippingHead}>
              <Text style={s.deliveryTitle}>Delivery Charges</Text>

              <View style={s.deliveryInfo}>
                <Text style={s.deliveryInfoText}>i</Text>
              </View>
            </View>

            <View style={s.deliveryStages}>
              {deliveryStages.map((stage, index) => {
                const reached = index <= activeStage;

                return (
                  <View key={stage.amount} style={s.deliveryStage}>
                    <View
                      style={[
                        s.deliveryStageLine,
                        {
                          backgroundColor: stage.color,
                          opacity: reached ? 1 : 0.22,
                        },
                      ]}
                    />

                    <View
                      style={[
                        s.deliveryMarker,
                        {
                          borderColor: stage.color,
                          backgroundColor: reached ? stage.color : "#FFFFFF",
                        },
                      ]}
                    >
                      {reached && <Text style={s.deliveryCheck}>✓</Text>}
                    </View>

                    <Text
                      style={[
                        s.deliveryStageAmount,
                        reached && {
                          color: stage.color,
                        },
                      ]}
                    >
                      {money(stage.amount, currency)}
                      {index === 2 ? "+" : ""}
                    </Text>

                    <Text style={s.deliveryStageFee}>
                      Delivery {money(stage.fee, currency)}
                    </Text>
                  </View>
                );
              })}
            </View>

            <View style={s.deliveryMessageRow}>
              <Text style={s.deliveryMessage}>{deliveryMessage}</Text>

              <Text style={s.deliveryMessageIcon}>🛒</Text>
            </View>
          </Card>

          {items.map((x) => (
            <Card key={`${x.product_id}-${x.size_ml}`} style={s.cartItem}>
              <Image source={{ uri: x.image_url }} style={s.cartImg} />

              <View style={{ flex: 1 }}>
                <Text style={s.name}>{x.name}</Text>

                <Text style={s.muted}>
                  {sizeLabel(x.size_ml, x.unit_type)} •{" "}
                  {money((x.base_price * x.size_ml) / 1000)} each
                </Text>

                <Text style={s.itemTotal}>
                  {money(((x.base_price * x.size_ml) / 1000) * x.quantity)}
                </Text>

                <View style={s.cartActions}>
                  <Qty
                    value={x.quantity}
                    onMinus={() => change(x.product_id, x.size_ml, -1)}
                    onPlus={() => {
                      if (x.quantity >= 5) {
                        Toast.show({
                          type: "error",
                          text1: "Maximum Quantity",
                          text2: "Only 5 units of this product can be added.",
                          position: "bottom",
                        });
                        return;
                      }

                      change(x.product_id, x.size_ml, 1);
                    }}
                  />

                  <Pressable onPress={() => remove(x.product_id, x.size_ml)}>
                    <Text style={s.remove}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            </Card>
          ))}

          <Card style={s.summary}>
            <Text style={s.summaryTitle}>Order summary</Text>

            <SummaryRow label="Subtotal" value={subtotal} currency={currency} />

            <SummaryRow
              label="Shipping"
              value={
                shipping === 0 && shippingInfo?.free_shipping_enabled
                  ? "FREE"
                  : shipping
              }
              currency={currency}
            />

            <Divider />

            <SummaryRow
              label="Total amount"
              value={total}
              strong
              green
              currency={currency}
            />

            <Button
              title={
                remaining > 0
                  ? `Add ${money(remaining)} more`
                  : "Proceed to checkout"
              }
              disabled={remaining > 0}
              onPress={() => navigation.navigate("Checkout")}
            />
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
export function CheckoutScreen({ navigation }) {
  const {
    items,
    add,
    subtotal,
    shipping,
    total,
    shippingInfo,
    refreshShipping,
  } = useCart();
  const now = useKarachiClock();
  const date = now.date;
  const [addresses, setAddresses] = useState([]),
    [slots, setSlots] = useState([]),
    [products, setProducts] = useState([]),
    [availableCoupons, setAvailableCoupons] = useState([]),
    [slot, setSlot] = useState(null),
    [address, setAddress] = useState(null),
    [method, setMethod] = useState("cod"),
    [busy, setBusy] = useState(false),
    [coupon, setCoupon] = useState(""),
    [appliedCoupon, setAppliedCoupon] = useState(null);

  const load = async () => {
    try {
      const [a, t, p, c] = await Promise.all([
        api.get("/addresses"),
        api.get("/time-slots", { params: { date } }),
        api.get("/products"),
        api.get("/coupons"),
        refreshShipping(),
      ]);
      setAddresses(a.data || []);
      setSlots(t.data || []);
      setProducts(p.data || []);
      setAvailableCoupons(c.data || []);
      if (!address && a.data?.length)
        setAddress(a.data.find((x) => x.is_default) || a.data[0]);
    } catch (e) {
      Alert.alert("Checkout error", apiError(e));
    }
  };

  useEffect(() => {
    load();
  }, [date]);

  const discount = appliedCoupon?.amount || 0;
  const minimum = Number(shippingInfo?.minimum_order ?? 0);
  const currency = shippingInfo?.currency || "PKR";
  const payableTotal = Math.max(0, subtotal - discount) + shipping;
  const applyCoupon = async () => {
    const code = coupon.trim().toUpperCase();
    if (!code) return Alert.alert("Coupon", "Enter a coupon code first.");
    try {
      const r = await api.post("/coupons/validate", { code, subtotal });
      setAppliedCoupon({
        code: r.data.code,
        amount: Number(r.data.discount || 0),
      });
      Alert.alert(
        "Coupon applied",
        `You saved ${money(Number(r.data.discount || 0))} on products subtotal.`,
      );
    } catch (e) {
      Alert.alert("Coupon not available", apiError(e));
    }
  };
  useEffect(() => {
    if (!appliedCoupon?.code) return;
    let live = true;
    api
      .post("/coupons/validate", { code: appliedCoupon.code, subtotal })
      .then((r) => {
        if (live)
          setAppliedCoupon((prev) =>
            prev ? { ...prev, amount: Number(r.data.discount || 0) } : prev,
          );
      })
      .catch(() => {
        if (live) setAppliedCoupon(null);
      });
    return () => {
      live = false;
    };
  }, [subtotal]);
  const removeCoupon = () => setAppliedCoupon(null);

  const place = async () => {
    if (shippingInfo && !shippingInfo.allowed)
      return Alert.alert(
        "Minimum order",
        `Minimum order amount is ${currency} ${minimum}. Please add ${currency} ${(minimum - subtotal).toFixed(0)} more to your cart.`,
      );
    if (!address)
      return Alert.alert(
        "Delivery address",
        "Please select or add a delivery address.",
      );
    if (!slot)
      return Alert.alert(
        "Delivery slot",
        "Please select a delivery time slot.",
      );
    if (!isSelectableSlot(slot, getKarachiNow()))
      return Alert.alert(
        "Delivery slot",
        "This delivery slot is no longer available. Please select a future slot for today.",
      );
    try {
      setBusy(true);
      const r = await api.post("/orders", {
        address_id: address.id,
        delivery_lat: address.latitude,
        delivery_lng: address.longitude,
        delivery_date: date,
        time_slot_id: slot.id,
        payment_method: method,
        items: items.map((x) => ({
          product_id: x.product_id,
          size_ml: x.size_ml,
          quantity: x.quantity,
        })),
        coupon_code: appliedCoupon?.code || "",
      });
      navigation.replace(
        method === "jazzcash" ? "Payment" : "Order Confirmation",
        {
          orderId: r.data.order_id,
          orderNumber: r.data.order_number,
          total: r.data.total ?? payableTotal,
        },
      );
    } catch (e) {
      Alert.alert("Could not place order", apiError(e));
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={screen}>
      <Header title="Checkout" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={pad}>
        <SectionTitle
          title="Delivery address"
          action="Manage"
          onPress={() => navigation.navigate("Address Management")}
        />
        {addresses.length === 0 ? (
          <Card accent>
            <Text style={s.name}>No saved address</Text>
            <Text style={s.muted}>Add a delivery address to continue.</Text>
            <Button
              secondary
              title="+ Add address"
              onPress={() => navigation.navigate("Address Management")}
            />
          </Card>
        ) : (
          addresses.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => setAddress(a)}
              style={[s.option, a.id === address?.id && s.optionSelected]}
            >
              <View style={s.radio}>
                {a.id === address?.id && <View style={s.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.row}>
                  <Text style={s.name}>{a.label || "Home"}</Text>
                  {a.is_default && <Text style={s.defaultText}>DEFAULT</Text>}
                </View>
                <Text style={s.muted}>{a.address_line}</Text>
                <Text style={s.cityText}>{a.city || "City"}</Text>
              </View>
            </Pressable>
          ))
        )}

        <SectionTitle title="Delivery date" />
        <Input value={date} editable={false} placeholder="YYYY-MM-DD" />
        <SectionTitle
          title="Delivery time"
          action="See all"
          onPress={() =>
            navigation.navigate("Time Slot Selection", {
              date,
              onSelect: (x) => setSlot(x),
            })
          }
        />
        {slots.length === 0 ? (
          <Card>
            <Text style={s.muted}>No slots available for today.</Text>
          </Card>
        ) : (
          slots.map((x) => {
            const disabled = !isSelectableSlot(x, now);

            return (
              <Pressable
                key={x.id}
                onPress={() => !disabled && setSlot(x)}
                disabled={disabled}
                style={[
                  s.slot,
                  x.id === slot?.id && s.optionSelected,
                  disabled && { opacity: 0.45 },
                ]}
              >
                <View>
                  <Text style={s.name}>
                    {timeLabel(x.start_time)} – {timeLabel(x.end_time)}
                  </Text>

                  <Text style={s.muted}>
                    {x.full
                      ? "FULL"
                      : disabled
                        ? "UNAVAILABLE"
                        : `${x.max_orders - x.booked_orders} slots left`}
                  </Text>
                </View>

                {x.id === slot?.id ? (
                  <Text style={s.checkCircle}>✓</Text>
                ) : (
                  <Text style={s.arrow}>›</Text>
                )}
              </Pressable>
            );
          })
        )}

        <SectionTitle title="Payment method" />
        <Pressable
          onPress={() => setMethod("jazzcash")}
          style={[s.paymentOption, method === "jazzcash" && s.optionSelected]}
        >
          <Text style={s.paymentIcon}>💳</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>JazzCash</Text>
            <Text style={s.muted}>Secure online payment</Text>
          </View>
          <View style={s.radio}>
            {method === "jazzcash" && <View style={s.radioDot} />}
          </View>
        </Pressable>
        <Pressable
          onPress={() => setMethod("cod")}
          style={[s.paymentOption, method === "cod" && s.optionSelected]}
        >
          <Text style={s.paymentIcon}>💵</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>Cash on Delivery</Text>
            <Text style={s.muted}>Pay when your groceries arrive</Text>
          </View>
          <View style={s.radio}>
            {method === "cod" && <View style={s.radioDot} />}
          </View>
        </Pressable>

        <Card style={{ marginTop: 18 }}>
          <View style={s.row}>
            <Text style={s.summaryTitle}>Discount coupon</Text>
            {availableCoupons.length > 0 && (
              <Text style={s.couponAvailableLabel}>
                {availableCoupons.length} available
              </Text>
            )}
          </View>
          <View style={s.couponInputRow}>
            <View style={{ flex: 1 }}>
              <Input
                placeholder="Enter coupon code"
                value={coupon}
                onChangeText={setCoupon}
                autoCapitalize="characters"
              />
            </View>
            <Pressable
              style={s.couponApplyButton}
              onPress={applyCoupon}
              disabled={!!appliedCoupon}
            >
              <Text style={s.couponApplyText}>
                {appliedCoupon ? "Applied" : "Apply"}
              </Text>
            </Pressable>
          </View>
          {appliedCoupon && (
            <View style={s.couponApplied}>
              <Text style={s.couponAppliedText}>
                ✓ {appliedCoupon.code} applied — save{" "}
                {money(appliedCoupon.amount)}
              </Text>
              <Pressable onPress={removeCoupon}>
                <Text style={s.remove}>Remove</Text>
              </Pressable>
            </View>
          )}
          <Text style={s.muted}>
            Coupon discounts apply to products subtotal only. Delivery charges
            are not discounted.
          </Text>
          {availableCoupons.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, marginTop: 10 }}
            >
              {availableCoupons.slice(0, 5).map((x) => (
                <Pressable
                  key={x.id}
                  onPress={() => {
                    setCoupon(x.code);
                  }}
                  style={s.couponMini}
                >
                  <Text style={s.couponMiniCode}>{x.code}</Text>
                  <Text style={s.couponMiniValue}>
                    {x.discount_type === "percentage"
                      ? `${x.discount_value}% OFF`
                      : `${money(x.discount_value)} OFF`}
                  </Text>
                  <Text style={s.couponMiniMin}>
                    Min. {money(x.min_order_amount)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </Card>

        <CheckoutRecommendations
          products={products}
          cartItems={items}
          onAdd={(product) => add(product, 500)}
          onProductPress={(product) =>
            navigation.navigate("Product Details", { productId: product.id })
          }
          onSeeAll={() => navigation.navigate("Search")}
        />

        <Card style={{ marginTop: 18 }}>
          <Text style={s.summaryTitle}>Order summary</Text>
          <SummaryRow label="Subtotal" value={subtotal} currency={currency} />
          <SummaryRow
            label="Shipping"
            value={
              shipping === 0 && shippingInfo?.free_shipping_enabled
                ? "FREE"
                : shipping
            }
            currency={currency}
          />
          {discount > 0 && (
            <SummaryRow
              label={`Discount (${appliedCoupon.code})`}
              value={-discount}
              currency={currency}
              green
            />
          )}
          <Divider />
          <SummaryRow
            label="Total amount"
            value={payableTotal}
            strong
            green
            currency={currency}
          />
        </Card>
        {shippingInfo && !shippingInfo.allowed && (
          <Card accent>
            <Text style={s.name}>
              Minimum order: {currency} {minimum}
            </Text>
            <Text style={s.muted}>
              You need {currency} {(minimum - subtotal).toFixed(0)} more to
              place your order.
            </Text>
          </Card>
        )}
        <Button
          title={
            method === "jazzcash"
              ? "Continue to JazzCash"
              : `Place order • ${money(payableTotal)}`
          }
          onPress={place}
          loading={busy}
          disabled={Boolean(shippingInfo && !shippingInfo.allowed)}
        />
      </ScrollView>
    </View>
  );
}
export function TimeSlotSelectionScreen({ route, navigation }) {
  const now = useKarachiClock();
  const date = now.date;
  const [slots, setSlots] = useState([]);

  useEffect(() => {
    api
      .get("/time-slots", { params: { date } })
      .then((r) => setSlots(r.data || []))
      .catch((e) => Alert.alert("Error", apiError(e)));
  }, [date]);

  return (
    <View style={screen}>
      <Header
        title="Delivery time"
        subtitle={date}
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={pad}>
        {slots.map((x) => {
          const disabled = !isSelectableSlot(x, now);

          return (
            <Pressable
              key={x.id}
              disabled={disabled}
              onPress={() => {
                route.params?.onSelect?.(x);
                navigation.goBack();
              }}
              style={[s.bigSlot, disabled && { opacity: 0.45 }]}
            >
              <View style={s.slotClock}>
                <Text>◷</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={s.name}>
                  {timeLabel(x.start_time)} – {timeLabel(x.end_time)}
                </Text>

                <Text style={s.muted}>
                  {x.full
                    ? `${x.booked_orders} / ${x.max_orders} • FULL`
                    : disabled
                      ? "UNAVAILABLE"
                      : `${x.booked_orders} booked • ${
                          x.max_orders - x.booked_orders
                        } slots left`}
                </Text>
              </View>

              {disabled ? (
                <StatusPill status="cancelled" />
              ) : (
                <Text style={s.arrow}>›</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function OrderConfirmationScreen({ route, navigation }) {
  const { clear } = useCart();
  useEffect(() => {
    clear();
  }, []);
  return (
    <View style={s.center}>
      <View style={s.successCircle}>
        <Text style={s.successCheck}>✓</Text>
      </View>
      <Text style={s.kicker}>ORDER CONFIRMED</Text>
      <Text style={s.h1}>Thanks for your order!</Text>
      <Text style={s.p}>
        Your order <Text style={s.greenText}>{route.params?.orderNumber}</Text>{" "}
        has been received and is being prepared.
      </Text>
      <Card style={s.confirmCard}>
        <SummaryRow
          label="Order total"
          value={route.params?.total || 0}
          strong
          green
        />
        <Text style={s.muted}>
          We'll deliver it in your selected time slot.
        </Text>
      </Card>
      <Button
        title="Track my order"
        onPress={() =>
          navigation.replace("Order Tracking", {
            orderId: route.params?.orderId,
          })
        }
      />
      <Button
        secondary
        title="Continue shopping"
        onPress={() => navigation.popToTop()}
      />
    </View>
  );
}

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

export function OrdersScreen({ navigation }) {
  const [o, setO] = useState([]);

  const load = React.useCallback(
    (silent = false) =>
      api
        .get("/orders")
        .then((r) => setO(r.data || []))
        .catch((e) => {
          if (!silent) Alert.alert("Orders", apiError(e));
        }),
    [],
  );

  useOrderSync(load);

  // Format date with day name
  // Example: Sunday, September 13, 2026
  const formatOrderDay = (date) => {
    if (!date || date === "Unknown date") {
      return "Unknown date";
    }

    const parsedDate = new Date(`${date}T00:00:00`);

    if (Number.isNaN(parsedDate.getTime())) {
      return date;
    }

    return parsedDate.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  // Group orders by delivery date
  // Latest date first
  // Orders within the same date: latest slot first
  const groupedOrders = React.useMemo(() => {
    const groups = {};

    o.forEach((order) => {
      const date = order.delivery_date || "Unknown date";

      if (!groups[date]) {
        groups[date] = [];
      }

      groups[date].push(order);
    });

    return Object.entries(groups)
      .map(([date, orders]) => {
        // Sort orders inside each date
        const sortedOrders = [...orders].sort((a, b) => {
          const timeA = a.slot_start_time || "";
          const timeB = b.slot_start_time || "";

          return timeB.localeCompare(timeA);
        });

        return [date, sortedOrders];
      })
      .sort(([dateA], [dateB]) => {
        // Unknown date always goes to bottom
        if (dateA === "Unknown date") return 1;
        if (dateB === "Unknown date") return -1;

        // Latest delivery date first
        return new Date(`${dateB}T00:00:00`) - new Date(`${dateA}T00:00:00`);
      });
  }, [o]);

  return (
    <View style={screen}>
      <Header title="My Orders" subtitle="Track every FreshCart delivery" />

      <FlatList
        data={groupedOrders}
        keyExtractor={([date]) => String(date)}
        contentContainerStyle={s.listPad}
        renderItem={({ item: [date, orders] }) => (
          <View style={{ marginBottom: 20 }}>
            {/* Day / Date Header */}
            <Text style={s.dayHeader}>{formatOrderDay(date)}</Text>

            {/* Orders for this date */}
            {orders.map((item) => (
              <Pressable
                key={item.id}
                onPress={() =>
                  navigation.navigate("Order Details", {
                    orderId: item.id,
                  })
                }
              >
                <Card style={s.orderCard}>
                  <View style={s.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.name}>{item.order_number}</Text>

                      <Text style={s.muted}>
                        {timeLabel(item.slot_start_time)} -{" "}
                        {timeLabel(item.slot_end_time)}
                      </Text>

                      <Text style={s.muted}>
                        {fmtStatus(item.payment_method)}
                      </Text>
                    </View>

                    <StatusPill status={item.status} />
                  </View>

                  <Divider />

                  <View style={s.row}>
                    <Text style={s.muted}>Order total</Text>

                    <Text style={s.orderTotal}>{money(item.total)}</Text>
                  </View>

                  <Text style={s.viewDetails}>View details ›</Text>
                </Card>
              </Pressable>
            ))}
          </View>
        )}
        ListEmptyComponent={
          <Empty text="You haven't placed any orders yet." icon="📦" />
        }
      />
    </View>
  );
}
export function OrderDetailsScreen({ route, navigation }) {
  const [o, setO] = useState(null);
  const load = React.useCallback(
    (silent = false) =>
      api
        .get(`/orders/${route.params.orderId}`)
        .then((r) => setO(r.data))
        .catch((e) => {
          if (!silent) Alert.alert("Order", apiError(e));
        }),
    [route.params.orderId],
  );
  useOrderSync(load);
  if (!o) return <Loader />;
  return (
    <View style={screen}>
      <Header
        title={o.order_number}
        subtitle="Order details"
        onBack={() => navigation.goBack()}
        right={<StatusPill status={o.status} />}
      />
      <ScrollView contentContainerStyle={pad}>
        {o.items?.map((x) => (
          <Card key={x.id} style={s.detailItem}>
            <Image source={{ uri: x.image_url }} style={s.detailItemImg} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{x.product_name}</Text>
              <Text style={s.muted}>
                {sizeLabel(x.size_ml, x.unit_type)} × {x.quantity}
              </Text>
              <Text style={s.itemTotal}>{money(x.item_total)}</Text>
            </View>
          </Card>
        ))}
        <Card style={s.summary}>
          <Text style={s.summaryTitle}>Payment summary</Text>
          <SummaryRow label="Subtotal" value={o.subtotal} />
          <SummaryRow
            label="Shipping"
            value={Number(o.shipping) === 0 ? "FREE" : o.shipping}
          />
          <Divider />
          <SummaryRow label="Total" value={o.total} strong green />
        </Card>
        <Card>
          <Text style={s.label}>Delivery</Text>
          <Text style={s.name}>{o.delivery_address}</Text>
          <Text style={s.muted}>
            {o.delivery_date} • {timeLabel(o.slot_start_time)} -{" "}
            {timeLabel(o.slot_end_time)}
          </Text>
          <Text style={s.muted}>
            Payment:{" "}
            {o.payment_method === "jazzcash" ? "JazzCash" : "Cash on Delivery"}
          </Text>
        </Card>
        {o.status === "delivered" && o.delivery_proof?.file_url && (
          <Card accent style={{ marginTop: 14 }}>
            <Text style={s.name}>Order Delivered ✓</Text>
            <Text style={s.label}>Delivery Proof</Text>
            <Image
              source={{ uri: o.delivery_proof.file_url }}
              style={s.proofImage}
            />
            <Text style={s.muted}>
              Delivered on{" "}
              {new Date(o.delivery_proof.captured_at).toLocaleString()}
            </Text>
          </Card>
        )}
        <Button
          title="Track order"
          onPress={() =>
            navigation.navigate("Order Tracking", { orderId: o.id })
          }
        />
      </ScrollView>
    </View>
  );
}

export function OrderTrackingScreen({ route, navigation }) {
  const [o, setO] = useState(null);
  const load = React.useCallback(
    (silent = false) =>
      api
        .get(`/orders/${route.params.orderId}`)
        .then((r) => setO(r.data))
        .catch((e) => {
          if (!silent) Alert.alert("Tracking", apiError(e));
        }),
    [route.params.orderId],
  );
  useOrderSync(load);
  if (!o) return <Loader />;
  const steps = [
    "pending",
    "confirmed",
    "preparing",
    "out_for_delivery",
    "delivered",
  ];
  const current = Math.max(0, steps.indexOf(o.status));
  return (
    <View style={screen}>
      <Header
        title="Order tracking"
        subtitle={o.order_number}
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={pad}>
        <Card accent>
          <View style={s.trackHeader}>
            <Text style={s.trackOrder}>#{o.order_number}</Text>
            <StatusPill status={o.status} />
          </View>
          <Text style={s.muted}>Your groceries are on their way.</Text>
        </Card>
        <Card style={{ marginTop: 14 }}>
          {steps.map((st, i) => (
            <View key={st} style={s.timelineRow}>
              <View style={s.timelineRail}>
                {i <= current ? (
                  <View style={s.timelineDone}>
                    <Text style={s.timelineCheck}>✓</Text>
                  </View>
                ) : (
                  <View style={s.timelineDot} />
                )}
                {i < steps.length - 1 && (
                  <View
                    style={[s.timelineLine, i < current && s.timelineLineDone]}
                  />
                )}
              </View>
              <View style={s.timelineCopy}>
                <Text
                  style={[s.timelineTitle, i <= current && s.timelineActive]}
                >
                  {st === "out_for_delivery"
                    ? "Out for delivery"
                    : st[0].toUpperCase() + st.slice(1)}
                </Text>
                <Text style={s.muted}>
                  {i < current
                    ? "Completed"
                    : i === current
                      ? "Current status"
                      : "Waiting"}
                </Text>
              </View>
            </View>
          ))}
        </Card>
        <Card style={{ marginTop: 14 }}>
          <Text style={s.label}>Delivery Address</Text>
          <Text style={s.name}>{o.delivery_address}</Text>
          <Text style={s.muted}>
            {o.delivery_date} • {timeLabel(o.slot_start_time)} -{" "}
            {timeLabel(o.slot_end_time)}
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}

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

export function AccountScreen({ navigation }) {
  const { user, logout } = useAuth();
  return (
    <View style={screen}>
      <Header title="Account" subtitle="Manage your FreshCart profile" />
      <ScrollView contentContainerStyle={pad}>
        <Card style={s.profileCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials(user?.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.profileName}>{user?.name}</Text>
            <Text style={s.muted}>{user?.email}</Text>
            <Text style={s.muted}>{user?.phone || "Customer"}</Text>
          </View>
        </Card>
        <SectionTitle title="Account" />
        <Pressable
          style={s.menuRow}
          onPress={() => navigation.navigate("Address Management")}
        >
          <Text style={s.menuIcon}>📍</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>Delivery addresses</Text>
            <Text style={s.muted}>Manage your saved delivery addresses</Text>
          </View>
          <Text style={s.arrow}>›</Text>
        </Pressable>
        <Pressable
          style={s.menuRow}
          onPress={() => navigation.navigate("Notifications")}
        >
          <Text style={s.menuIcon}>🔔</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>Notifications</Text>
            <Text style={s.muted}>Orders, price updates and offers</Text>
          </View>
          <Text style={s.arrow}>›</Text>
        </Pressable>
        <SectionTitle title="Support" />
        <Card style={s.supportCard}>
          <Text style={s.supportTitle}>Need help?</Text>
          <Text style={s.supportDescription}>
            Our team is here to help with your FreshCart order.
          </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Email FreshCart support"
            onPress={() => Linking.openURL("mailto:freshcart@gmail.com")}
            style={s.supportLink}
          >
            <Text style={s.supportLinkText}>✉️ freshcart@gmail.com</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Call FreshCart support"
            onPress={() => Linking.openURL("tel:0312-4497159")}
            style={s.supportLink}
          >
            <Text style={s.supportLinkText}>📞 0312-4497159</Text>
          </Pressable>
        </Card>
        <Button
          danger
          title="Sign out"
          onPress={() =>
            Alert.alert("Sign out?", "You can sign back in anytime.", [
              { text: "Cancel" },
              { text: "Sign out", style: "destructive", onPress: logout },
            ])
          }
        />
      </ScrollView>
    </View>
  );
}

export function RiderOrdersScreen({ navigation }) {
  const [o, setO] = useState([]);
  const [selectedTab, setSelectedTab] = useState("today");

  const load = React.useCallback(
    (silent = false) =>
      api
        .get("/rider/orders")
        .then((r) => setO(r.data || []))
        .catch((e) => {
          if (!silent) {
            Alert.alert("Rider orders", apiError(e));
          }
        }),
    [],
  );

  useOrderSync(load);

  // Get Karachi date in YYYY-MM-DD format
  const getKarachiDate = (offset = 0) => {
    const now = new Date();

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Karachi",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);

    const year = Number(parts.find((x) => x.type === "year").value);
    const month = Number(parts.find((x) => x.type === "month").value);
    const day = Number(parts.find((x) => x.type === "day").value);

    const date = new Date(Date.UTC(year, month - 1, day + offset));

    return date.toISOString().slice(0, 10);
  };

  const today = getKarachiDate(0);

  // Today's remaining / undelivered order count
  const todayCount = React.useMemo(() => {
    return o.filter(
      (item) => item.delivery_date === today && item.status !== "delivered",
    ).length;
  }, [o, today]);

  // Filter orders according to selected tab
  const filteredOrders = React.useMemo(() => {
    if (selectedTab === "today") {
      return o.filter((item) => item.delivery_date === today);
    }

    return o;
  }, [o, selectedTab, today]);

  // Group orders by delivery date
  // Delivered orders are automatically moved to the bottom
  const groupedOrders = React.useMemo(() => {
    const groups = {};

    filteredOrders.forEach((item) => {
      const date = item.delivery_date;

      if (!groups[date]) {
        groups[date] = [];
      }

      groups[date].push(item);
    });

    // Active orders first
    // Delivered orders last
    Object.keys(groups).forEach((date) => {
      groups[date].sort((a, b) => {
        const aDelivered = a.status === "delivered";
        const bDelivered = b.status === "delivered";

        if (aDelivered && !bDelivered) {
          return 1;
        }

        if (!aDelivered && bDelivered) {
          return -1;
        }

        return 0;
      });
    });

    return Object.entries(groups);
  }, [filteredOrders]);

  // Format:
  // Saturday, 12-09-2026
  const formatDateHeading = (dateString) => {
    const [year, month, day] = dateString.split("-").map(Number);

    const date = new Date(year, month - 1, day);

    const weekday = date.toLocaleDateString("en-US", {
      weekday: "long",
    });

    return `${weekday}, ${String(day).padStart(
      2,
      "0",
    )}-${String(month).padStart(2, "0")}-${year}`;
  };

  return (
    <View style={screen}>
      <Header title="Rider dashboard" subtitle="Orders by delivery day" />

      {/* DATE TABS */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 16,
          paddingVertical: 12,
          gap: 8,
        }}
      >
        {[
          {
            key: "today",
            label: `Today (${todayCount})`,
          },
          {
            key: "all",
            label: "All",
          },
        ].map((tab) => {
          const active = selectedTab === tab.key;

          return (
            <Pressable
              key={tab.key}
              onPress={() => setSelectedTab(tab.key)}
              style={{
                flex: 1,
                paddingVertical: 11,
                borderRadius: 10,
                alignItems: "center",
                borderWidth: 1,
                borderColor: active ? "#16803C" : "#dfe7e1",
                backgroundColor: active ? "#16803C" : "#ffffff",
              }}
            >
              <Text
                style={{
                  fontWeight: "700",
                  color: active ? "#ffffff" : "#16803C",
                }}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={groupedOrders}
        keyExtractor={([date]) => date}
        contentContainerStyle={s.listPad}
        renderItem={({ item: [date, orders] }) => (
          <View style={{ marginBottom: 20 }}>
            {/* DATE HEADER */}
            <Text
              style={[
                s.name,
                {
                  fontSize: 18,
                  marginBottom: 10,
                },
              ]}
            >
              {formatDateHeading(date)}
            </Text>

            {orders.map((item) => {
              const isDelivered = item.status === "delivered";

              return (
                <Pressable
                  key={item.id}
                  disabled={isDelivered}
                  onPress={() =>
                    navigation.navigate("Rider Order Details", {
                      orderId: item.id,
                    })
                  }
                >
                  <Card
                    style={[
                      s.orderCard,
                      isDelivered && {
                        backgroundColor: "#f1f3f2",
                        borderColor: "#d5d9d7",
                      },
                    ]}
                  >
                    <View style={s.row}>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            s.name,
                            isDelivered && {
                              color: "#6b7280",
                            },
                          ]}
                        >
                          {item.order_number}
                        </Text>

                        <Text
                          style={[
                            s.muted,
                            isDelivered && {
                              color: "#8a918d",
                            },
                          ]}
                        >
                          {timeLabel(item.slot_start_time)} -{" "}
                          {timeLabel(item.slot_end_time)}
                        </Text>

                        <Text
                          style={[
                            s.muted,
                            isDelivered && {
                              color: "#8a918d",
                            },
                          ]}
                        >
                          {item.payment_method === "cod" ? "COD" : "JazzCash"}
                        </Text>
                      </View>
                    </View>

                    <Divider />

                    <View style={s.row}>
                      <Text
                        style={[
                          s.muted,
                          isDelivered && {
                            color: "#8a918d",
                          },
                        ]}
                      >
                        Total
                      </Text>

                      <Text
                        style={[
                          s.orderTotal,
                          isDelivered && {
                            color: "#16803C",
                          },
                        ]}
                      >
                        {money(item.total)}
                      </Text>
                    </View>

                    {/* STATUS LABEL */}
                    <Text
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        fontWeight: "700",
                        color: isDelivered ? "#16803C" : "#D97706",
                        textAlign: "right",
                      }}
                    >
                      ✓ {isDelivered ? "Delivered" : item.status}
                    </Text>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        )}
        ListEmptyComponent={
          <Empty
            text={
              selectedTab === "today"
                ? "No deliveries for today."
                : "No deliveries assigned."
            }
            icon="🚴"
          />
        }
      />
    </View>
  );
}

export function RiderOrderDetailsScreen({ route, navigation }) {
  const [o, setO] = useState(null);
  const load = React.useCallback(
    (silent = false) =>
      api
        .get(`/orders/${route.params.orderId}`)
        .then((r) => setO(r.data))
        .catch((e) => {
          if (!silent) Alert.alert("Order", apiError(e));
        }),
    [route.params.orderId],
  );
  useOrderSync(load);
  if (!o) return <Loader />;
  const updateStatus = async (status) => {
    try {
      await api.put(`/rider/orders/${o.id}/status`, { status });
      setO((current) => ({ ...current, status }));
    } catch (e) {
      Alert.alert("Update delivery status", apiError(e));
    }
  };
  return (
    <View style={screen}>
      <Header
        title={o.order_number}
        subtitle="Delivery details"
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={pad}>
        <Card accent>
          <Text style={s.kicker}>CUSTOMER</Text>
          <Text style={s.name}>{o.customer_name || "Customer"}</Text>
          {o.customer_phone ? (
            <Text style={s.muted}>☎ {o.customer_phone}</Text>
          ) : null}
          <Text style={[s.kicker, { marginTop: 14 }]}>CUSTOMER ADDRESS</Text>
          <Text style={s.name}>{o.delivery_address}</Text>
          <Text style={s.muted}>
            📍 {o.delivery_latitude}, {o.delivery_longitude}
          </Text>
        </Card>
        <Card style={{ marginTop: 14 }}>
          <Text style={s.label}>Delivery slot</Text>
          <Text style={s.name}>{o.delivery_date}</Text>
          <Text style={s.muted}>
            {timeLabel(o.slot_start_time)} - {timeLabel(o.slot_end_time)}
          </Text>
          <Text style={[s.muted, { marginTop: 8 }]}>
            Status: {fmtStatus(o.status)}
          </Text>
        </Card>
        <SectionTitle title="Order items" />
        {o.items?.map((x) => (
          <View key={x.id} style={s.riderItem}>
            <Text style={s.name}>{x.product_name}</Text>
            <Text style={s.muted}>
              {sizeLabel(x.size_ml, x.unit_type)} × {x.quantity}
            </Text>
            <Text style={s.itemTotal}>{money(x.item_total)}</Text>
          </View>
        ))}
        <Card style={{ marginTop: 14 }}>
          <SummaryRow label="Total" value={o.total} strong green />
          <Text style={s.muted}>
            Payment:{" "}
            {o.payment_method === "cod" ? "Cash on Delivery" : "JazzCash"}
          </Text>
        </Card>
        {o.status === "assigned" ? (
          <Button
            title="Accept delivery"
            onPress={() => updateStatus("accepted")}
            icon="✓"
          />
        ) : o.status === "accepted" ? (
          <Button
            title="Mark picked up"
            onPress={() => updateStatus("preparing")}
            icon="📦"
          />
        ) : o.status === "preparing" ? (
          <Button
            title="Start delivery"
            onPress={() => updateStatus("out_for_delivery")}
            icon="🚴"
          />
        ) : o.status === "out_for_delivery" ? (
          <Button
            title="Take delivery photo"
            onPress={() =>
              navigation.navigate("Delivery Photo", { orderId: o.id })
            }
            icon="📸"
          />
        ) : o.status === "delivered" ? (
          <Button title="Delivered ✓" disabled />
        ) : null}
      </ScrollView>
    </View>
  );
}

export function DeliveryPhotoScreen({ route, navigation }) {
  const [uri, setUri] = useState(null),
    [busy, setBusy] = useState(false);
  const pick = async () => {
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (!r.canceled) setUri(r.assets[0].uri);
  };
  const upload = async () => {
    if (!uri)
      return Alert.alert("Delivery proof", "Take a delivery photo first.");
    try {
      setBusy(true);
      const f = new FormData();
      f.append("photo", {
        uri,
        name: "delivery-proof.jpg",
        type: "image/jpeg",
      });
      await api.post(`/rider/orders/${route.params.orderId}/photo`, f, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await api.post(`/rider/orders/${route.params.orderId}/complete`);
      Alert.alert(
        "Delivered ✓",
        "Delivery proof saved and order marked delivered.",
        [{ text: "Done", onPress: () => navigation.popToTop() }],
      );
    } catch (e) {
      Alert.alert("Delivery proof", apiError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={screen}>
      <Header
        title="Delivery proof"
        subtitle="Required before completion"
        onBack={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={pad}>
        <Card accent>
          <Text style={s.name}>📸 Take a clear photo at the doorstep</Text>
          <Text style={s.muted}>
            The photo is securely uploaded to the FreshCart backend and attached
            to this order.
          </Text>
        </Card>
        {uri ? (
          <Image source={{ uri }} style={s.proofImage} />
        ) : (
          <View style={s.cameraPlaceholder}>
            <Text style={s.cameraIcon}>📷</Text>
            <Text style={s.name}>No photo captured</Text>
            <Text style={s.muted}>Delivery proof photo is required.</Text>
          </View>
        )}
        <Button secondary title="Take photo" onPress={pick} />
        <Button
          title="Upload & complete delivery"
          onPress={upload}
          loading={busy}
          disabled={!uri}
        />
      </ScrollView>
    </View>
  );
}

export function AdminDashboardScreen({ navigation }) {
  const { logout } = useAuth();
  const [d, setD] = useState(null);
  useEffect(() => {
    api
      .get("/admin/dashboard")
      .then((r) => setD(r.data))
      .catch((e) => Alert.alert("Dashboard", apiError(e)));
  }, []);
  const actions = [
    ["Products", "Manage catalogue", "🥬", "Products"],
    ["Categories", "Organize departments", "📂", "Admin Categories"],
    ["Prices", "Base prices / kg / L", "💰", "Admin Prices"],
    ["Orders", "Update order status", "📦", "Orders"],
    ["Riders", "Manage delivery team", "🚴", "Riders"],
    ["Time slots", "Capacity & schedules", "🕐", "Slots"],
    ["Coupons", "Generate discounts", "🎟", "Admin Coupons"],
    [
      "Shipping & orders",
      "Checkout rules and delivery fees",
      "🚚",
      "Admin Shipping Settings",
    ],
  ];
  return (
    <View style={screen}>
      <Header
        title="FreshCart Admin"
        subtitle="Operations overview"
        right={
          <Button
            title="Log out"
            danger
            onPress={() =>
              Alert.alert("Log out", "Are you sure you want to log out?", [
                { text: "Cancel", style: "cancel" },
                { text: "Log out", style: "destructive", onPress: logout },
              ])
            }
          />
        }
      />
      <ScrollView contentContainerStyle={pad}>
        <View style={s.adminWelcome}>
          <Text style={s.adminEyebrow}>TODAY'S OVERVIEW</Text>
          <Text style={s.adminTitle}>Good day, Admin</Text>
          <Text style={s.muted}>Keep the FreshCart operation moving.</Text>
        </View>
        <View style={s.statsGrid}>
          {[
            ["Orders", d?.orders ?? 0, "📦"],
            ["Revenue", money(d?.revenue ?? 0), "💰"],
            ["Customers", d?.customers ?? 0, "👥"],
            ["Products", d?.products ?? 0, "🥬"],
          ].map(([label, val, ico]) => (
            <Card key={label} style={s.statCard}>
              <Text style={s.statIcon}>{ico}</Text>
              <Text style={s.statValue}>{val}</Text>
              <Text style={s.muted}>{label}</Text>
            </Card>
          ))}
        </View>
        <SectionTitle title="Quick management" />
        {actions.map(([t, sub, ico, target]) => (
          <Pressable
            key={t}
            style={s.adminAction}
            onPress={() => navigation.navigate(target)}
          >
            <View style={s.adminActionIcon}>
              <Text>{ico}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{t}</Text>
              <Text style={s.muted}>{sub}</Text>
            </View>
            <Text style={s.arrow}>›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export function AdminProductsScreen({ navigation }) {
  const [p, setP] = useState([]);
  const [editingPriceId, setEditingPriceId] = useState(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [savingPriceId, setSavingPriceId] = useState(null);
  const load = () =>
    api
      .get("/products")
      .then((r) => setP(r.data || []))
      .catch((e) => Alert.alert("Products", apiError(e)));
  useEffect(() => {
    load();
  }, []);
  const remove = async (x) => {
    try {
      await api.delete(`/admin/products/${x.id}`);
      load();
    } catch (e) {
      Alert.alert("Delete", apiError(e));
    }
  };
  const beginPriceEdit = (item) => {
    if (
      savingPriceId ||
      (editingPriceId !== null && editingPriceId !== item.id)
    )
      return;
    setEditingPriceId(item.id);
    setPriceDraft(String(item.base_price));
  };
  const cancelPriceEdit = () => {
    if (savingPriceId) return;
    setEditingPriceId(null);
    setPriceDraft("");
  };
  const savePrice = async (item) => {
    const price = Number(priceDraft.trim());
    if (!priceDraft.trim() || !Number.isFinite(price) || price <= 0) {
      Alert.alert("Invalid price", "Enter a positive price.");
      return;
    }

    try {
      setSavingPriceId(item.id);
      const response = await api.put(`/admin/products/${item.id}`, {
        category_id: Number(item.category_id),
        name: item.name,
        description: item.description || "",
        image_url: item.image_url || "",
        base_price: price,
        stock_quantity: Number(item.stock_quantity || 0),
        unit_type: item.unit_type,
        is_active: item.is_active !== false,
      });
      setP((current) =>
        current.map((product) =>
          product.id === item.id ? { ...product, base_price: price } : product,
        ),
      );
      setEditingPriceId(null);
      setPriceDraft("");
      Alert.alert("Price updated", "Price updated successfully.");
      return response;
    } catch (e) {
      Alert.alert("Price update failed", apiError(e));
    } finally {
      setSavingPriceId(null);
    }
  };
  return (
    <View style={screen}>
      <Header
        title="Products"
        subtitle={`${p.length} catalogue items`}
        right={
          <Button
            title="+ Add"
            onPress={() =>
              navigation.navigate("Admin Product Editor", { reload: load })
            }
          />
        }
      />
      <FlatList
        data={p}
        keyExtractor={(x) => String(x.id)}
        contentContainerStyle={s.listPad}
        renderItem={({ item }) => (
          <Card style={s.adminProduct}>
            <Image source={{ uri: item.image_url }} style={s.adminThumb} />
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{item.name}</Text>
              {editingPriceId === item.id ? (
                <View style={s.inlinePriceEditor}>
                  <View style={s.inlinePriceInputWrap}>
                    <Text style={s.inlinePricePrefix}>Rs.</Text>
                    <TextInput
                      autoFocus
                      selectTextOnFocus
                      value={priceDraft}
                      onChangeText={setPriceDraft}
                      keyboardType="decimal-pad"
                      style={s.inlinePriceInput}
                      editable={savingPriceId !== item.id}
                      accessibilityLabel={`Price for ${item.name}`}
                    />
                    <Text style={s.inlinePriceSuffix}>/ {item.unit_type}</Text>
                  </View>
                  <View style={s.inlinePriceActions}>
                    <Pressable
                      disabled={savingPriceId === item.id}
                      onPress={() => savePrice(item)}
                      style={s.inlinePriceSave}
                    >
                      {savingPriceId === item.id ? (
                        <ActivityIndicator
                          size="small"
                          color={theme.colors.white}
                        />
                      ) : (
                        <Text style={s.inlinePriceSaveText}>✓ Save</Text>
                      )}
                    </Pressable>
                    <Pressable
                      disabled={savingPriceId === item.id}
                      onPress={cancelPriceEdit}
                      style={s.inlinePriceCancel}
                    >
                      <Text style={s.inlinePriceCancelText}>✕ Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Edit price for ${item.name}`}
                  onPress={() => beginPriceEdit(item)}
                  style={s.inlinePriceDisplay}
                >
                  <Text style={s.muted}>
                    {money(item.base_price)} / {item.unit_type}
                  </Text>
                  <Text style={s.inlinePriceEditIcon}>✎</Text>
                </Pressable>
              )}
              <Text style={item.stock_quantity > 0 ? s.stockGood : s.red}>
                {item.stock_quantity > 0
                  ? `${item.stock_quantity} ${item.unit_type} in stock`
                  : "Out of stock"}
              </Text>
            </View>
            <View>
              <Pressable
                onPress={() =>
                  navigation.navigate("Admin Product Editor", {
                    product: item,
                    reload: load,
                  })
                }
              >
                <Text style={s.adminLink}>Edit</Text>
              </Pressable>
              <Pressable onPress={() => remove(item)}>
                <Text style={s.remove}>Disable</Text>
              </Pressable>
            </View>
          </Card>
        )}
      />
    </View>
  );
}

export function AdminProductEditorScreen({ route, navigation }) {
  const p = route.params?.product;
  const [n, setN] = useState(p?.name || ""),
    [desc, setDesc] = useState(p?.description || ""),
    [img, setImg] = useState(p?.image_url || ""),
    [cat, setCat] = useState(String(p?.category_id || "")),
    [price, setPrice] = useState(String(p?.base_price || "")),
    [stock, setStock] = useState(String(p?.stock_quantity || "")),
    [unit, setUnit] = useState(p?.unit_type || "kg"),
    [cats, setCats] = useState([]),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get("/categories").then((r) => setCats(r.data || []));
  }, []);
  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
    });
    if (r.canceled) return;
    const u = r.assets[0].uri;
    if (p) {
      try {
        const f = new FormData();
        f.append("image", { uri: u, name: "product.jpg", type: "image/jpeg" });
        const z = await api.post(`/admin/products/${p.id}/image`, f, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setImg(z.data.image_url);
      } catch (e) {
        Alert.alert("Image upload", apiError(e));
      }
    } else setImg(u);
  };
  const save = async () => {
    try {
      setBusy(true);
      const body = {
        category_id: Number(cat),
        name: n,
        description: desc,
        image_url: img,
        base_price: Number(price),
        stock_quantity: Number(stock),
        unit_type: unit,
        is_active: true,
      };
      let response;
      if (p) response = await api.put(`/admin/products/${p.id}`, body);
      else response = await api.post("/admin/products", body);
      if (p && Number(price) !== Number(p.base_price)) {
        const sent = response.data?.sent ?? 0;
        const failed = response.data?.failed ?? 0;
        Alert.alert(
          "Product saved",
          failed > 0
            ? `Price updated. ${sent} push notification(s) sent; ${failed} failed.`
            : `Price updated and ${sent} push notification(s) sent.`,
        );
      }
      route.params?.reload?.();
      navigation.goBack();
    } catch (e) {
      Alert.alert("Save product", apiError(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <KeyboardAvoidingView
      style={screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={pad}>
        <Header
          title={p ? "Edit product" : "Add product"}
          onBack={() => navigation.goBack()}
        />
        {img ? (
          <Image source={{ uri: img }} style={s.editorImage} />
        ) : (
          <View style={s.editorPlaceholder}>
            <Text style={{ fontSize: 40 }}>🥬</Text>
          </View>
        )}
        <Button
          secondary
          title="Choose product image"
          icon="📷"
          onPress={pick}
        />
        <Input
          label="Product name"
          placeholder="Tomato"
          value={n}
          onChangeText={setN}
        />
        <Input
          label="Description"
          placeholder="Fresh and organic..."
          value={desc}
          onChangeText={setDesc}
          multiline
        />
        <Input
          label="Category ID"
          placeholder={cats[0] ? String(cats[0].id) : "1"}
          value={cat}
          onChangeText={setCat}
          keyboardType="numeric"
        />
        <View style={s.unitToggle}>
          <Pressable
            onPress={() => setUnit("kg")}
            style={[s.unitButton, unit === "kg" && s.unitSelected]}
          >
            <Text style={s.name}>Price / kg</Text>
          </Pressable>
          <Pressable
            onPress={() => setUnit("liter")}
            style={[s.unitButton, unit === "liter" && s.unitSelected]}
          >
            <Text style={s.name}>Price / liter</Text>
          </Pressable>
        </View>
        <Input
          label={`Base price / ${unit}`}
          placeholder="200"
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
        />
        <Text style={s.formHint}>
          You enter one base price. FreshCart calculates 250g/ml through 5kg/L
          automatically.
        </Text>
        <Input
          label={`Stock (${unit})`}
          placeholder="50"
          value={stock}
          onChangeText={setStock}
          keyboardType="decimal-pad"
        />
        <Button title="Save product" onPress={save} loading={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AdminOrdersScreen() {
  const [o, setO] = useState([]),
    [eligible, setEligible] = useState({}),
    [assigning, setAssigning] = useState(null);
  const load = () =>
    api
      .get("/admin/orders")
      .then((r) => setO(r.data || []))
      .catch((e) => Alert.alert("Orders", apiError(e)));
  useEffect(() => {
    load();
  }, []);
  const update = async (id, status) => {
    try {
      await api.put(`/admin/orders/${id}/status`, { status });
      load();
    } catch (e) {
      Alert.alert("Order status", apiError(e));
    }
  };
  const loadEligible = async (id) => {
    try {
      setAssigning(id);
      const response = await api.get(`/admin/orders/${id}/eligible-riders`);
      setEligible((current) => ({ ...current, [id]: response.data || [] }));
    } catch (e) {
      Alert.alert("Eligible riders", apiError(e));
    } finally {
      setAssigning(null);
    }
  };
  const assign = async (orderId, riderId) => {
    try {
      await api.post(`/admin/orders/${orderId}/assign-rider`, {
        rider_id: riderId,
      });
      Alert.alert("Rider assigned", "The rider has been notified.");
      load();
    } catch (e) {
      Alert.alert("Assign rider", apiError(e));
    }
  };
  const printOrder = async (id) => {
    try {
      const { data } = await api.get(`/orders/${id}`);
      const escapeHtml = (value) =>
        String(value ?? "—")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      const rows = (data.items || [])
        .map(
          (item) => `<tr>
            <td>${escapeHtml(item.product_name)}</td>
            <td>${escapeHtml(sizeLabel(item.size_ml, item.unit_type))}</td>
            <td>${item.quantity}</td>
            <td>${escapeHtml(money(item.unit_price))}</td>
            <td>${escapeHtml(money(item.item_total))}</td>
          </tr>`,
        )
        .join("");
      const discount = Number(data.discount || 0);
      await Print.printAsync({
        html: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
          body{font-family:Arial,sans-serif;color:#17211b;padding:24px}h1{text-align:center;color:#0b3d26;margin:0}h2{text-align:center;font-size:14px;font-weight:400;margin:4px 0 20px}h3{border-bottom:1px solid #dfe7e1;padding-bottom:8px} .info{line-height:1.8;border-bottom:1px solid #dfe7e1;padding-bottom:16px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{text-align:left;border-bottom:1px solid #e4ebe6;padding:9px 5px;font-size:12px}th{background:#f5faf7}.summary{margin:20px 0 0 auto;width:240px;line-height:1.9}.total{border-top:2px solid #0b3d26;margin-top:6px;padding-top:6px;font-size:18px;font-weight:700}
        </style></head><body><h1>FRESHCART</h1><h2>GROCERY DELIVERY<br>ORDER SLIP</h2><h3>Order Information</h3><div class="info"><b>Customer:</b> ${escapeHtml(data.customer_name || `Customer #${data.user_id}`)}<br><b>Order ID:</b> ${data.id}<br><b>Order Number:</b> ${escapeHtml(data.order_number)}<br><b>Delivery Location:</b> ${escapeHtml(data.delivery_address)}<br><b>Delivery Slot:</b> ${escapeHtml(timeLabel(data.slot_start_time))} - ${escapeHtml(timeLabel(data.slot_end_time))}<br><b>Payment:</b> ${data.payment_method === "jazzcash" ? "JazzCash" : "COD"}</div><table><thead><tr><th>Product</th><th>Size</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><div class="summary"><div>Subtotal: <b>${escapeHtml(money(data.subtotal))}</b></div><div>Shipping: <b>${escapeHtml(money(data.shipping))}</b></div>${discount > 0 ? `<div>Discount: <b>${escapeHtml(money(discount))}</b></div>` : ""}<div class="total">Total Bill: ${escapeHtml(money(data.total))}</div></div></body></html>`,
      });
    } catch (error) {
      Alert.alert("Print order", apiError(error));
    }
  };
  return (
    <View style={screen}>
      <Header title="Orders" subtitle="Operations & fulfilment" />
      <FlatList
        data={o}
        keyExtractor={(x) => String(x.id)}
        contentContainerStyle={s.listPad}
        renderItem={({ item }) => (
          <Card style={s.adminOrder}>
            <View style={s.row}>
              <View>
                <Text style={s.name}>{item.order_number}</Text>
                <Text style={s.muted}>Customer #{item.user_id}</Text>
              </View>
              <StatusPill status={item.status} />
            </View>
            <Text style={s.addressPreview}>📍 {item.delivery_address}</Text>
            <View style={s.row}>
              <Text style={s.muted}>
                {item.payment_method === "cod"
                  ? "Cash on delivery"
                  : "JazzCash"}
              </Text>
              <Text style={s.orderTotal}>{money(item.total)}</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, marginTop: 12 }}
            >
              {[
                "confirmed",
                "preparing",
                "assigned",
                "out_for_delivery",
                "delivered",
              ].map((st) => (
                <Pressable
                  key={st}
                  style={s.statusAction}
                  onPress={() => update(item.id, st)}
                >
                  <Text>
                    {st === "out_for_delivery" ? "Out for delivery" : st}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                style={s.statusAction}
                onPress={() => printOrder(item.id)}
              >
                <Text>Print</Text>
              </Pressable>
              <Pressable
                style={s.statusAction}
                onPress={() => loadEligible(item.id)}
                disabled={assigning === item.id}
              >
                <Text>
                  {assigning === item.id ? "Loading..." : "Assign rider"}
                </Text>
              </Pressable>
            </ScrollView>
            {item.rider_name ? (
              <Text style={s.muted}>Assigned rider: {item.rider_name}</Text>
            ) : null}
            {eligible[item.id]?.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <Text style={s.label}>
                  Eligible riders for {timeLabel(item.slot_start_time)} -{" "}
                  {timeLabel(item.slot_end_time)}
                </Text>
                {eligible[item.id].map((rider) => (
                  <Pressable
                    key={rider.id}
                    style={s.adminAction}
                    onPress={() => assign(item.id, rider.id)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.name}>{rider.name}</Text>
                      <Text style={s.muted}>
                        {rider.phone || "No phone"} •{" "}
                        {rider.vehicle_type || "Vehicle"}{" "}
                        {rider.vehicle_number || ""}
                      </Text>
                    </View>
                    <Text style={s.muted}>{rider.active_orders} active</Text>
                  </Pressable>
                ))}
              </View>
            )}
            {eligible[item.id] && eligible[item.id].length === 0 && (
              <Text style={s.muted}>
                No active, available rider is allocated to this slot.
              </Text>
            )}
          </Card>
        )}
      />
    </View>
  );
}

export function AdminRidersScreen() {
  const [r, setR] = useState([]),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [phone, setPhone] = useState(""),
    [vehicleType, setVehicleType] = useState("Bike"),
    [vehicleNumber, setVehicleNumber] = useState(""),
    [slotOptions, setSlotOptions] = useState([]),
    [assignedSlots, setAssignedSlots] = useState({}),
    [openRider, setOpenRider] = useState(null);
  const load = () =>
    Promise.all([
      api.get("/admin/riders"),
      api.get("/admin/time-slots/availability", {
        params: { date: dateISO() },
      }),
    ])
      .then(([riders, slots]) => {
        setR(riders.data || []);
        setSlotOptions(slots.data || []);
      })
      .catch((e) => Alert.alert("Riders", apiError(e)));
  const loadAssignments = async (riderId) => {
    try {
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
    }
  };
  const saveAssignments = async (riderId) => {
    try {
      await api.put(
        `/admin/riders/${riderId}/time-slots`,
        {
          time_slot_ids: assignedSlots[riderId] || [],
        },
        { params: { date: dateISO() } },
      );
      Alert.alert(
        "Assignments saved",
        "The rider's delivery slots were updated.",
      );
    } catch (e) {
      Alert.alert("Save assignments", apiError(e));
    }
  };
  useEffect(() => {
    load();
  }, []);
  return (
    <ScrollView style={screen} contentContainerStyle={pad}>
      <Header title="Riders" subtitle="Delivery team" />
      {r.map((x) => (
        <Card key={x.id} style={{ marginBottom: 10 }}>
          <View style={s.row}>
            <View style={s.riderAvatar}>
              <Text>{initials(x.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{x.name}</Text>
              <Text style={s.muted}>{x.email}</Text>
              <Text style={s.muted}>
                {x.vehicle_type || x.vehicle || "Bike"} {x.vehicle_number || ""}{" "}
                • {x.is_available ? "Available" : "Unavailable"}
              </Text>
              <Text style={s.muted}>{x.active_orders || 0} active orders</Text>
            </View>
            <View>
              <StatusPill status={x.is_active ? "confirmed" : "cancelled"} />
            </View>
          </View>
          <Button
            secondary
            title={x.is_available ? "Set unavailable" : "Set available"}
            onPress={async () => {
              try {
                await api.put(`/admin/riders/${x.id}`, {
                  name: x.name,
                  email: x.email,
                  phone: x.phone,
                  vehicle_type: x.vehicle_type || x.vehicle || "Bike",
                  vehicle_number: x.vehicle_number || "",
                  is_active: x.is_active,
                  is_available: !x.is_available,
                });
                load();
              } catch (e) {
                Alert.alert("Update rider", apiError(e));
              }
            }}
          />
          <Button
            secondary
            title={
              openRider === x.id ? "Hide today’s slots" : "Select today’s slots"
            }
            onPress={async () => {
              const next = openRider === x.id ? null : x.id;
              setOpenRider(next);
              if (next && assignedSlots[x.id] === undefined)
                await loadAssignments(x.id);
            }}
          />
          {openRider === x.id && (
            <View style={{ marginTop: 8 }}>
              {slotOptions.map((slot) => {
                const checked = (assignedSlots[x.id] || []).includes(
                  slot.slot_id,
                );
                const assignedToOther =
                  slot.assigned_rider && slot.assigned_rider.id !== x.id;
                const disabled = assignedToOther || !slot.is_active;
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
                          : [...(current[x.id] || []), slot.slot_id],
                      }))
                    }
                  >
                    <Text style={{ marginRight: 10 }}>
                      {assignedToOther ? "🔒" : checked ? "☑" : "☐"}
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
                title="Save assignment"
                onPress={() => saveAssignments(x.id)}
              />
            </View>
          )}
        </Card>
      ))}
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
        title="Add rider"
        onPress={async () => {
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
            load();
          } catch (e) {
            Alert.alert("Add rider", apiError(e));
          }
        }}
      />
    </ScrollView>
  );
}

export function AdminTimeSlotsScreen() {
  const [date, setDate] = useState(dateISO()),
    [slots, setSlots] = useState([]),
    [editingId, setEditingId] = useState(null),
    [start, setStart] = useState("13:00"),
    [end, setEnd] = useState("14:00"),
    [maxOrders, setMaxOrders] = useState("10"),
    [isActive, setIsActive] = useState(true);
  const load = () =>
    api
      .get("/admin/time-slots")
      .then((r) =>
        setSlots((r.data || []).filter((slot) => !date || slot.date === date)),
      )
      .catch((e) => Alert.alert("Slots", apiError(e)));
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
  return (
    <ScrollView style={screen} contentContainerStyle={pad}>
      <Header title="Time slots" subtitle="Capacity management" />
      <Input label="Date" value={date} onChangeText={setDate} />
      {slots.map((x) => (
        <Card key={x.id} style={s.slotAdmin}>
          <View style={s.slotClock}>
            <Text>◷</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>
              {timeLabel(x.start_time)} – {timeLabel(x.end_time)}
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
          <View style={{ marginLeft: 8, flexDirection: "row" }}>
            <IconButton
              icon="✎"
              accessibilityLabel="Edit time slot"
              onPress={() => editSlot(x)}
            />
            <IconButton
              icon="⌫"
              accessibilityLabel="Delete time slot"
              onPress={() =>
                Alert.alert(
                  "Delete time slot",
                  "This cannot be undone for an unused slot.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: async () => {
                        try {
                          await api.delete(`/admin/time-slots/${x.id}`);
                          load();
                          if (editingId === x.id) resetForm();
                        } catch (e) {
                          Alert.alert("Delete time slot", apiError(e));
                        }
                      },
                    },
                  ],
                )
              }
            />
          </View>
        </Card>
      ))}
      <SectionTitle title={editingId ? "Update slot" : "Create slot"} />
      <View style={s.twoInputs}>
        <Input
          label="Start"
          value={start}
          onChangeText={(value) => {
            setStart(value);
            const [hour, minute] = value.split(":").map(Number);
            if (!Number.isNaN(hour) && !Number.isNaN(minute)) {
              setEnd(
                `${String((hour + 1) % 24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
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
      />
      <Button
        title={editingId ? "Update time slot" : "Create time slot"}
        onPress={async () => {
          try {
            const payload = {
              slot_date: date,
              start_time: start,
              end_time: end,
              max_orders: Number(maxOrders),
              is_active: isActive,
            };
            if (!payload.max_orders || payload.max_orders < 1) {
              Alert.alert("Time slot", "Maximum orders must be at least 1.");
              return;
            }
            if (editingId) {
              await api.put(`/admin/time-slots/${editingId}`, payload);
            } else {
              await api.post("/admin/time-slots", payload);
            }
            resetForm();
            load();
          } catch (e) {
            Alert.alert(editingId ? "Update slot" : "Save slot", apiError(e));
          }
        }}
      />
      {editingId && (
        <Button secondary title="Cancel edit" onPress={resetForm} />
      )}
    </ScrollView>
  );
}

export function AdminPricesScreen() {
  const [p, setP] = useState([]),
    [v, setV] = useState({});
  useEffect(() => {
    api
      .get("/products")
      .then((r) => setP(r.data || []))
      .catch((e) => Alert.alert("Prices", apiError(e)));
  }, []);
  return (
    <ScrollView style={screen} contentContainerStyle={pad}>
      <Header title="Base prices" subtitle="Server-calculated sizes" />
      {p.map((x) => (
        <Card key={x.id} style={s.priceAdmin}>
          <View style={s.row}>
            <View>
              <Text style={s.name}>{x.name}</Text>
              <Text style={s.muted}>
                Current {money(x.base_price)} / {x.unit_type}
              </Text>
            </View>
            <Text style={s.priceTag}>{x.unit_type}</Text>
          </View>
          <Input
            label={`New base price / ${x.unit_type}`}
            value={v[x.id]?.price ?? String(x.base_price)}
            onChangeText={(z) =>
              setV((prev) => ({
                ...prev,
                [x.id]: { ...(prev[x.id] || {}), price: z },
              }))
            }
            keyboardType="decimal-pad"
          />
          <Input
            label="Notification message (optional)"
            placeholder="🔥 Fresh deal — grab this product now!"
            value={v[x.id]?.message ?? ""}
            onChangeText={(z) =>
              setV((prev) => ({
                ...prev,
                [x.id]: { ...(prev[x.id] || {}), message: z },
              }))
            }
          />
          <Button
            secondary
            title="Save price & notify customers"
            onPress={async () => {
              try {
                const val = v[x.id] || {};
                const response = await api.post("/admin/prices", {
                  product_id: x.id,
                  base_price: Number(val.price ?? x.base_price),
                  notification_message: val.message || "",
                });
                const sent = response.data?.sent ?? 0;
                const failed = response.data?.failed ?? 0;
                Alert.alert(
                  "Saved ✓",
                  failed > 0
                    ? `Price updated. ${sent} push notification(s) sent; ${failed} failed. Customers can still see the update in Notifications.`
                    : `Price updated and ${sent} push notification(s) sent.`,
                );
              } catch (e) {
                Alert.alert("Save price", apiError(e));
              }
            }}
          />
        </Card>
      ))}
    </ScrollView>
  );
}

export function AdminCategoriesScreen() {
  const [c, setC] = useState([]),
    [name, setName] = useState(""),
    [icon, setIcon] = useState("🛒"),
    [desc, setDesc] = useState("");
  const load = () =>
    api
      .get("/categories")
      .then((r) => setC(r.data || []))
      .catch((e) => Alert.alert("Categories", apiError(e)));
  useEffect(() => {
    load();
  }, []);
  return (
    <ScrollView style={screen} contentContainerStyle={pad}>
      <Header title="Categories" subtitle="Catalogue departments" />
      {c.map((x) => (
        <Card key={x.id} style={{ marginBottom: 10 }}>
          <View style={s.row}>
            <Text style={s.catAdminIcon}>{x.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{x.name}</Text>
              <Text style={s.muted}>{x.description}</Text>
            </View>
            <Text style={x.is_active ? s.stockGood : s.red}>
              {x.is_active ? "ACTIVE" : "OFF"}
            </Text>
          </View>
        </Card>
      ))}
      <SectionTitle title="Add category" />
      <Input
        label="Name"
        placeholder="Vegetables"
        value={name}
        onChangeText={setName}
      />
      <Input
        label="Icon"
        placeholder="🥬"
        value={icon}
        onChangeText={setIcon}
      />
      <Input
        label="Description"
        placeholder="Fresh & organic"
        value={desc}
        onChangeText={setDesc}
      />
      <Button
        title="Add category"
        onPress={async () => {
          try {
            await api.post("/admin/categories", {
              name,
              icon,
              description: desc,
              is_active: true,
            });
            setName("");
            load();
          } catch (e) {
            Alert.alert("Add category", apiError(e));
          }
        }}
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoMark: {
    width: 78,
    height: 78,
    borderRadius: 28,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  logoLeaf: { fontSize: 48, fontWeight: "900", color: theme.colors.primary },
  logo: { fontSize: 42, fontWeight: "900", color: "#fff", letterSpacing: -1 },
  splashSub: { color: "#DFF6E8", fontSize: 15, marginTop: 8 },
  onboard: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 24,
    justifyContent: "center",
  },
  locationArt: {
    width: 116,
    height: 116,
    borderRadius: 58,
    backgroundColor: theme.colors.primarySoft,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  locationPin: { fontSize: 62, color: theme.colors.primary },
  warningArt: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: theme.colors.warningSoft,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  warningIcon: { fontSize: 48 },
  kicker: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: theme.colors.primary,
    marginBottom: 8,
  },
  h1: {
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 35,
    color: theme.colors.text,
    marginBottom: 8,
  },
  p: {
    fontSize: 15,
    lineHeight: 23,
    color: theme.colors.muted,
    marginBottom: 14,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 18,
    padding: 13,
    marginVertical: 12,
  },
  infoIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  auth: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: theme.colors.background,
  },
  authLogo: { flexDirection: "row", alignItems: "center", marginBottom: 25 },
  logoMarkSmall: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  logoLeafSmall: { fontSize: 27, fontWeight: "900", color: "#fff" },
  brand: { fontSize: 30, fontWeight: "900", color: theme.colors.primary },
  demo: {
    textAlign: "center",
    color: theme.colors.muted,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 18,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
    minHeight: 42,
  },
  homeContent: {
    paddingHorizontal: 16,
    paddingTop: 44,
    paddingBottom: 112,
  },
  locationPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.primary,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexShrink: 1,
    ...theme.shadow,
  },
  locationPillIcon: { fontSize: 15, marginRight: 5 },
  locationPillText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: "800",
    flexShrink: 1,
  },
  locationPillArrow: {
    color: theme.colors.white,
    fontSize: 20,
    lineHeight: 18,
    marginLeft: 5,
  },
  greetingBlock: { marginBottom: 16 },
  topActions: { flexDirection: "row", marginLeft: 10 },
  locationText: {
    fontSize: 11,
    color: theme.colors.primaryDark,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  greeting: {
    fontSize: 23,
    fontWeight: "900",
    color: theme.colors.text,
    marginTop: 5,
  },
  homePromoBanner: {
    minHeight: 212,
    borderRadius: 23,
    backgroundColor: "#EAF8F0",
    borderWidth: 1,
    borderColor: "#D6EFDF",
    overflow: "hidden",
    position: "relative",
    marginBottom: 16,
    ...theme.shadow,
  },
  homePromoGlow: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 105,
    right: -54,
    top: -34,
    backgroundColor: "#D7F2E1",
    opacity: 0.72,
  },
  homePromoCopy: {
    width: "62%",
    paddingLeft: 17,
    paddingTop: 20,
    zIndex: 2,
  },
  homePromoTitle: {
    color: theme.colors.text,
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 25,
  },
  homePromoTitleAccent: { color: theme.colors.primaryDark },
  homePromoDescription: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    marginTop: 9,
  },
  homePromoButton: {
    alignSelf: "flex-start",
    backgroundColor: theme.colors.primary,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 13,
    ...theme.shadow,
  },
  homePromoButtonPressed: { opacity: 0.82 },
  homePromoButtonText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: "900",
  },
  homePromoVisual: {
    position: "absolute",
    right: 2,
    top: 3,
    width: "43%",
    height: 183,
  },
  homePromoLeafTop: {
    position: "absolute",
    right: 9,
    top: 4,
    fontSize: 24,
    transform: [{ rotate: "22deg" }],
  },
  homePromoProduceTop: {
    position: "absolute",
    right: 16,
    top: 26,
    alignItems: "center",
    transform: [{ rotate: "-8deg" }],
  },
  homePromoProduce: {
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -4,
  },
  homePromoBasket: {
    position: "absolute",
    right: 11,
    bottom: 10,
    width: 116,
    height: 92,
    borderRadius: 22,
    backgroundColor: "#B9783E",
    borderWidth: 5,
    borderColor: "#965A2D",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "5deg" }],
    ...theme.shadow,
  },
  homePromoBasketProduce: {
    fontSize: 26,
    lineHeight: 31,
    letterSpacing: -5,
  },
  homePromoBasketImage: {
    position: "absolute",
    width: 43,
    height: 43,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#F8E6D2",
    backgroundColor: theme.colors.primarySoft,
  },
  homePromoBasketImageOne: {
    left: 9,
    top: 8,
    transform: [{ rotate: "-12deg" }],
  },
  homePromoBasketImageTwo: {
    right: 8,
    top: 6,
    transform: [{ rotate: "10deg" }],
  },
  homePromoBasketImageThree: {
    left: 18,
    bottom: 5,
    transform: [{ rotate: "8deg" }],
  },
  homePromoBasketImageFour: {
    right: 18,
    bottom: 4,
    transform: [{ rotate: "-8deg" }],
  },
  homePromoLeafBottom: {
    position: "absolute",
    left: 0,
    bottom: 16,
    fontSize: 21,
    transform: [{ rotate: "-25deg" }],
  },
  homePromoDots: {
    position: "absolute",
    bottom: 9,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  homePromoDotActive: {
    width: 16,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.primary,
  },
  homePromoDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#A9D8B9",
  },
  searchBar: {
    minHeight: 56,
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 17,
    marginBottom: 4,
    ...theme.shadow,
  },
  searchIcon: {
    fontSize: 27,
    color: theme.colors.primaryDark,
    marginRight: 10,
  },
  searchPlaceholder: { color: theme.colors.muted, fontSize: 13, flex: 1 },
  categoryScrollContent: { gap: 10, paddingVertical: 2, paddingRight: 4 },
  homeCategoryCard: { width: 82, alignItems: "center" },
  homeCategoryIcon: {
    width: 76,
    height: 76,
    borderRadius: 24,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    ...theme.shadow,
  },
  homeCategoryIconText: { fontSize: 31 },
  categoryMiniText: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.colors.text,
    marginTop: 7,
    textAlign: "center",
  },
  homeProductGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14,
  },
  homeProductCard: {
    width: "48.2%",
    backgroundColor: theme.colors.white,
    borderRadius: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    minHeight: 316,
    ...theme.shadow,
  },
  homeProductBody: { flex: 1 },
  homeProductImageWrap: {
    width: "100%",
    aspectRatio: 1.08,
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: theme.colors.primarySoft,
    position: "relative",
  },
  homeProductImage: { width: "100%", height: "100%" },
  homeOutBadge: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: 6,
    backgroundColor: "rgba(23, 33, 27, 0.76)",
    borderRadius: 8,
    paddingVertical: 5,
  },
  homeOutBadgeText: {
    color: theme.colors.white,
    fontSize: 9,
    fontWeight: "900",
    textAlign: "center",
  },
  homeProductName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 10,
    minHeight: 38,
  },
  homeProductPrice: {
    color: theme.colors.primaryDark,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 4,
  },
  homeProductUnit: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  homeStock: {
    color: theme.colors.success,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 7,
  },
  homeStockUnavailable: { color: theme.colors.muted },
  homeAddButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    minHeight: 40,
    paddingHorizontal: 6,
    marginTop: 10,
  },
  homeAddButtonDisabled: { backgroundColor: theme.colors.border },
  homeAddButtonPressed: { opacity: 0.82 },
  homeAddButtonText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: "900",
  },
  homeDeliveryCard: {
    backgroundColor: theme.colors.primarySoft,
    borderColor: "#CDEDD9",
    borderRadius: 20,
    marginTop: 20,
    padding: 16,
  },
  deliveryRow: { flexDirection: "row", alignItems: "center" },
  deliveryTruck: { fontSize: 30, marginRight: 12 },
  arrow: { fontSize: 28, color: theme.colors.muted },
  categoryWide: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadow,
  },
  categoryWideIcon: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  categoryTitle: { fontSize: 17, fontWeight: "900", color: theme.colors.text },
  listPad: { padding: 16, gap: 12 },
  detailImageWrap: {
    height: 360,
    backgroundColor: theme.colors.primarySoft,
    position: "relative",
  },
  detailImage: { width: "100%", height: "100%" },
  detailBack: { position: "absolute", left: 14, top: 16 },
  detailHeart: { position: "absolute", right: 14, top: 16 },
  detailBody: { padding: 20, paddingBottom: 100 },
  detailCategory: {
    fontSize: 10,
    color: theme.colors.primary,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  detailTitle: {
    fontSize: 31,
    fontWeight: "900",
    color: theme.colors.text,
    marginTop: 5,
  },
  detailDesc: {
    fontSize: 14,
    color: theme.colors.muted,
    lineHeight: 21,
    marginTop: 7,
  },
  detailPriceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: 15,
  },
  detailPrice: { fontSize: 25, fontWeight: "900", color: theme.colors.primary },
  perLabel: { fontSize: 13, color: theme.colors.muted, fontWeight: "700" },
  rating: {
    marginLeft: "auto",
    fontWeight: "900",
    color: theme.colors.warning,
  },
  label: {
    fontSize: 13,
    fontWeight: "900",
    color: theme.colors.text,
    marginBottom: 8,
  },
  sizeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  sizeBox: {
    width: "31.8%",
    minHeight: 73,
    padding: 11,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 15,
    backgroundColor: "#fff",
    position: "relative",
  },
  sizeSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  sizeMain: { fontWeight: "900", fontSize: 13, color: theme.colors.text },
  sizeMainSelected: { color: theme.colors.primaryDark },
  sizePrice: { fontSize: 11, color: theme.colors.muted, marginTop: 4 },
  check: {
    position: "absolute",
    right: 7,
    top: 7,
    color: theme.colors.primary,
    fontWeight: "900",
  },
  stockRow: { flexDirection: "row", alignItems: "center" },
  stockDot: { color: theme.colors.success, fontSize: 13, marginRight: 9 },
  stickyBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    paddingHorizontal: 18,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stickyPrice: { fontSize: 18, fontWeight: "900", color: theme.colors.text },
  shippingCard: {
    backgroundColor: "#F8FCF9",
    borderColor: "#E2F0E6",
    marginBottom: 12,
    shadowColor: "#174C2A",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 2,
  },
  shippingHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  deliveryTitle: { fontSize: 16, fontWeight: "900", color: theme.colors.text },
  deliveryInfo: {
    width: 19,
    height: 19,
    borderRadius: 10,
    backgroundColor: "#E0F2E7",
    alignItems: "center",
    justifyContent: "center",
  },
  deliveryInfoText: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: "900",
  },
  deliveryStages: { flexDirection: "row", marginTop: 18 },
  deliveryStage: { flex: 1, alignItems: "center", position: "relative" },
  deliveryStageLine: {
    position: "absolute",
    height: 5,
    borderRadius: 4,
    left: 0,
    right: 0,
    top: 8,
  },
  deliveryMarker: {
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  deliveryCheck: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  deliveryStageAmount: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "900",
    marginTop: 7,
  },
  deliveryStageFee: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 2,
    textAlign: "center",
  },
  deliveryMessageRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#EAF7EE",
    borderRadius: 12,
    paddingLeft: 12,
    paddingRight: 10,
    paddingVertical: 9,
    marginTop: 15,
  },
  deliveryMessage: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: "800",
    flex: 1,
    lineHeight: 17,
  },

  deliveryMessageIcon: { fontSize: 17, marginLeft: 8 },
  cartItem: { flexDirection: "row", gap: 12, marginBottom: 10 },
  cartImg: {
    width: 82,
    height: 82,
    borderRadius: 15,
    backgroundColor: theme.colors.primarySoft,
  },
  itemTotal: {
    fontSize: 15,
    fontWeight: "900",
    color: theme.colors.primaryDark,
    marginTop: 4,
  },
  cartActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 9,
  },
  remove: { fontSize: 12, color: theme.colors.danger, fontWeight: "800" },
  summary: { marginTop: 6, marginBottom: 20 },
  couponRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  couponApplied: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.primarySoft,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  couponAppliedText: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontSize: 12,
  },
  couponAvailableLabel: {
    fontSize: 11,
    color: theme.colors.primary,
    fontWeight: "900",
  },
  couponInputRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  couponApplyButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  couponApplyText: { color: "#fff", fontWeight: "900" },
  couponMini: {
    width: 118,
    padding: 10,
    borderRadius: 13,
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: "#CDEDD9",
  },
  couponMiniCode: {
    fontWeight: "900",
    color: theme.colors.primaryDark,
    fontSize: 13,
  },
  couponMiniValue: {
    fontWeight: "900",
    color: theme.colors.primary,
    fontSize: 12,
    marginTop: 3,
  },
  couponMiniMin: { fontSize: 10, color: theme.colors.muted, marginTop: 2 },
  summaryTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: theme.colors.text,
    marginBottom: 8,
  },
  remaining: { color: theme.colors.danger, fontWeight: "800" },
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
  radio: {
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  radioDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
  },
  defaultText: { fontSize: 9, color: theme.colors.primary, fontWeight: "900" },
  cityText: {
    fontSize: 11,
    color: theme.colors.primaryDark,
    fontWeight: "700",
    marginTop: 3,
  },
  slot: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primary,
    color: "#fff",
    textAlign: "center",
    textAlignVertical: "center",
    fontWeight: "900",
  },
  paymentOption: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 9,
    flexDirection: "row",
    alignItems: "center",
  },
  paymentIcon: { fontSize: 24, marginRight: 12 },
  bigSlot: {
    backgroundColor: "#fff",
    padding: 17,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    ...theme.shadow,
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
  successCircle: {
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  successCheck: { fontSize: 52, color: "#fff", fontWeight: "900" },
  center: {
    flex: 1,
    backgroundColor: theme.colors.background,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  confirmCard: { width: "100%", marginVertical: 18 },
  greenText: { color: theme.colors.primaryDark, fontWeight: "900" },
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
  orderCard: { marginBottom: 10 },
  orderTotal: {
    fontSize: 17,
    fontWeight: "900",
    color: theme.colors.primaryDark,
  },
  viewDetails: {
    color: theme.colors.primary,
    fontWeight: "900",
    fontSize: 12,
    marginTop: 10,
  },
  detailItem: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  detailItemImg: {
    width: 65,
    height: 65,
    borderRadius: 14,
    marginRight: 12,
    backgroundColor: theme.colors.primarySoft,
  },
  trackHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  trackOrder: { fontSize: 18, fontWeight: "900", color: theme.colors.text },
  timelineRow: { flexDirection: "row", minHeight: 74 },
  timelineRail: { width: 38, alignItems: "center" },
  timelineDone: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  timelineCheck: { color: "#fff", fontWeight: "900" },
  timelineDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: "#fff",
  },
  timelineLine: { width: 2, flex: 1, backgroundColor: theme.colors.border },
  timelineLineDone: { backgroundColor: theme.colors.primary },
  timelineCopy: { paddingLeft: 10, paddingTop: 3 },
  timelineTitle: { fontSize: 15, fontWeight: "800", color: theme.colors.muted },
  timelineActive: { color: theme.colors.text },
  addressIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  addressActions: { flexDirection: "row", gap: 8, marginTop: 12 },
  addressActionsButton: { flex: 1 },
  twoInputs: { flexDirection: "row", gap: 10 },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 62,
    height: 62,
    borderRadius: 21,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 21,
    fontWeight: "900",
    color: theme.colors.primaryDark,
  },
  profileName: { fontSize: 20, fontWeight: "900", color: theme.colors.text },
  menuRow: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 9,
  },
  menuIcon: { fontSize: 24, width: 38 },
  supportCard: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 30,
    borderColor: "#CDEDD9",
    padding: 22,
    ...theme.shadow,
  },
  supportTitle: {
    color: theme.colors.text,
    fontSize: 22,
    fontWeight: "800",
  },
  supportDescription: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 8,
    maxWidth: 420,
  },
  supportLink: {
    alignSelf: "flex-start",
    marginTop: 16,
    maxWidth: "100%",
  },
  supportLinkText: {
    color: theme.colors.primaryDark,
    fontSize: 15,
    fontWeight: "800",
    lineHeight: 22,
    flexShrink: 1,
  },
  addressPreview: {
    color: theme.colors.text,
    fontSize: 12,
    marginTop: 13,
    lineHeight: 18,
  },
  riderItem: {
    backgroundColor: "#fff",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  proofImage: { width: "100%", height: 360, borderRadius: 20, marginTop: 14 },
  cameraPlaceholder: {
    height: 360,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 14,
    backgroundColor: "#fff",
  },
  cameraIcon: { fontSize: 52, marginBottom: 10 },
  adminWelcome: {
    backgroundColor: theme.colors.black,
    borderRadius: 24,
    padding: 20,
    marginBottom: 14,
  },
  adminEyebrow: {
    fontSize: 10,
    color: "#A9C7B4",
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  adminTitle: { fontSize: 26, fontWeight: "900", color: "#fff", marginTop: 7 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { width: "48%", minHeight: 112 },
  statIcon: { fontSize: 20 },
  statValue: {
    fontSize: 25,
    fontWeight: "900",
    color: theme.colors.text,
    marginTop: 8,
  },
  adminAction: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 18,
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 9,
  },
  adminActionIcon: {
    width: 45,
    height: 45,
    borderRadius: 15,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  adminProduct: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginBottom: 10,
  },
  adminThumb: {
    width: 70,
    height: 70,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
  },
  inlinePriceDisplay: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 3,
    paddingVertical: 2,
  },
  inlinePriceEditIcon: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: "900",
    marginLeft: 6,
  },
  inlinePriceEditor: { marginTop: 5 },
  inlinePriceInputWrap: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 11,
    backgroundColor: theme.colors.white,
    paddingHorizontal: 8,
  },
  inlinePricePrefix: {
    color: theme.colors.primaryDark,
    fontSize: 12,
    fontWeight: "900",
  },
  inlinePriceInput: {
    minWidth: 48,
    maxWidth: 76,
    paddingVertical: 4,
    paddingHorizontal: 4,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  inlinePriceSuffix: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  inlinePriceActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 7,
  },
  inlinePriceSave: {
    minWidth: 62,
    minHeight: 30,
    borderRadius: 9,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  inlinePriceSaveText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: "900",
  },
  inlinePriceCancel: {
    minHeight: 30,
    paddingHorizontal: 3,
    justifyContent: "center",
  },
  inlinePriceCancelText: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: "800",
  },
  adminLink: {
    color: theme.colors.primary,
    fontWeight: "900",
    fontSize: 12,
    marginBottom: 13,
  },
  stockGood: {
    color: theme.colors.success,
    fontSize: 11,
    fontWeight: "900",
    marginTop: 5,
  },
  red: { color: theme.colors.danger, fontSize: 11, fontWeight: "800" },
  adminOrder: { marginBottom: 10 },
  statusAction: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  slotAdmin: { flexDirection: "row", alignItems: "center", marginBottom: 9 },
  priceAdmin: { marginBottom: 10 },
  priceTag: {
    backgroundColor: theme.colors.primarySoft,
    color: theme.colors.primaryDark,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 12,
    fontSize: 10,
    fontWeight: "900",
  },
  catAdminIcon: { fontSize: 32, width: 50 },
  editorImage: {
    width: "100%",
    height: 220,
    borderRadius: 20,
    marginBottom: 4,
  },
  editorPlaceholder: {
    height: 220,
    borderRadius: 20,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  unitToggle: { flexDirection: "row", gap: 9, marginBottom: 12 },
  unitButton: {
    flex: 1,
    padding: 15,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
  },
  unitSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  formHint: {
    fontSize: 11,
    color: theme.colors.muted,
    lineHeight: 16,
    marginTop: -3,
    marginBottom: 12,
  },
  dayHeader: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
    color: "#222",
  },
});
