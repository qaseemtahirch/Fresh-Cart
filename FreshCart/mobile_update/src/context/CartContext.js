import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import AsyncStorage from "@react-native-async-storage/async-storage";

import { api } from "../services/api";

const C = createContext();

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [shippingInfo, setShippingInfo] = useState(null);

  // Load cart
  useEffect(() => {
    AsyncStorage.getItem("freshcart_cart").then(
      (x) => x && setItems(JSON.parse(x)),
    );
  }, []);

  // Save cart
  useEffect(() => {
    AsyncStorage.setItem("freshcart_cart", JSON.stringify(items));
  }, [items]);

  // Add product to cart
  const add = (p, size) =>
    setItems((o) => {
      const i = o.findIndex(
        (x) => x.product_id === p.id && x.size_ml === size,
      );

      return i < 0
        ? [
            ...o,
            {
              product_id: p.id,
              name: p.name,
              image_url: p.image_url,
              unit_type: p.unit_type,
              base_price: p.base_price,
              size_ml: size,
              quantity: 1,
            },
          ]
        : o.map((x, n) =>
            n === i
              ? {
                  ...x,
                  quantity: x.quantity + 1,
                }
              : x,
          );
    });

  // Change quantity
  const change = (pid, size, d) =>
    setItems((o) =>
      o
        .map((x) =>
          x.product_id === pid && x.size_ml === size
            ? {
                ...x,
                quantity: Math.max(0, x.quantity + d),
              }
            : x,
        )
        .filter((x) => x.quantity),
    );

  // Remove item
  const remove = (pid, size) =>
    setItems((o) =>
      o.filter(
        (x) => !(x.product_id === pid && x.size_ml === size),
      ),
    );

  // Clear cart
  const clear = () => setItems([]);

  // Calculate item price
  const getItemPrice = useCallback((item) => {
    // Dozen products:
    // base_price is already the price for one dozen.
    if (item.unit_type === "dozen") {
      return Number(item.base_price || 0);
    }

    // KG / Liter products:
    return (
      (Number(item.base_price || 0) * Number(item.size_ml || 0)) /
      1000
    );
  }, []);

  // Calculate subtotal
  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum + getItemPrice(item) * Number(item.quantity || 0),
        0,
      ),
    [items, getItemPrice],
  );

  // Refresh shipping
  const refreshShipping = useCallback(async () => {
    const r = await api.get("/prices/today", {
      params: { subtotal },
    });

    setShippingInfo(r.data);

    return r.data;
  }, [subtotal]);

  // Update shipping whenever subtotal changes
  useEffect(() => {
    let live = true;

    api
      .get("/prices/today", {
        params: { subtotal },
      })
      .then((r) => {
        if (live) {
          setShippingInfo(r.data);
        }
      })
      .catch(() => {});

    return () => {
      live = false;
    };
  }, [subtotal]);

  const shipping = Number(shippingInfo?.shipping ?? 0);

  const total = subtotal + shipping;

  return (
    <C.Provider
      value={{
        items,

        add,
        change,
        remove,
        clear,

        subtotal,
        shipping,
        total,

        shippingInfo,
        refreshShipping,

        // Expose this so Cart / Checkout can use
        // the exact same price calculation.
        getItemPrice,
      }}
    >
      {children}
    </C.Provider>
  );
}

export const useCart = () => useContext(C);

