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
  const [items, setItems] = useState([]),
    [shippingInfo, setShippingInfo] = useState(null);
  useEffect(() => {
    AsyncStorage.getItem("freshcart_cart").then(
      (x) => x && setItems(JSON.parse(x)),
    );
  }, []);
  useEffect(() => {
    AsyncStorage.setItem("freshcart_cart", JSON.stringify(items));
  }, [items]);
  const add = (p, size) =>
    setItems((o) => {
      const i = o.findIndex((x) => x.product_id === p.id && x.size_ml === size);
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
        : o.map((x, n) => (n === i ? { ...x, quantity: x.quantity + 1 } : x));
    });
  const change = (pid, size, d) =>
    setItems((o) =>
      o
        .map((x) =>
          x.product_id === pid && x.size_ml === size
            ? { ...x, quantity: Math.max(0, x.quantity + d) }
            : x,
        )
        .filter((x) => x.quantity),
    );
  const remove = (pid, size) =>
    setItems((o) =>
      o.filter((x) => !(x.product_id === pid && x.size_ml === size)),
    );
  const clear = () => setItems([]);
  const subtotal = useMemo(
    () =>
      items.reduce(
        (s, x) => s + ((x.base_price * x.size_ml) / 1000) * x.quantity,
        0,
      ),
    [items],
  );
  const refreshShipping = useCallback(async () => {
    const r = await api.get("/prices/today", { params: { subtotal } });
    setShippingInfo(r.data);
    return r.data;
  }, [subtotal]);
  useEffect(() => {
    let live = true;
    api
      .get("/prices/today", { params: { subtotal } })
      .then((r) => live && setShippingInfo(r.data))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [subtotal]);
  const shipping = Number(shippingInfo?.shipping ?? 0);
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
        total: subtotal + shipping,
        shippingInfo,
        refreshShipping,
      }}
    >
      {children}
    </C.Provider>
  );
}
export const useCart = () => useContext(C);
