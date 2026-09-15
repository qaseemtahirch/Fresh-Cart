import React, { useEffect, useState } from "react";
import { Alert, FlatList, StyleSheet, View } from "react-native";
import { api, apiError } from "../services/api";
import { useCart } from "../context/CartContext";
import { Empty, Header, ProductCard } from "../components/UI";
import {
  screen,
} from "../utils/screenHelpers";

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

const s = StyleSheet.create({
  listPad: { padding: 16, gap: 12 },
});
