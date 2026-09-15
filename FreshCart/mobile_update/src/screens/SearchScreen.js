import React, { useEffect, useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, View } from "react-native";
import { api, apiError } from "../services/api";
import { useCart } from "../context/CartContext";
import { Empty, Header, Input, ProductCard } from "../components/UI";
import {
  screen,
} from "../utils/screenHelpers";

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

const s = StyleSheet.create({
  listPad: { padding: 16, gap: 12 },
});
