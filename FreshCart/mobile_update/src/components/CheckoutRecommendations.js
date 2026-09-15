import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { ProductCard, SectionTitle } from './UI';
import { theme } from '../theme/theme';

const normalize = value => String(value || '').trim().toLowerCase();

const RULES = {
  vegetables: {
    title: 'Complete your vegetables',
    subtitle: 'Fresh picks that go well with your vegetables',
    preferred: ['vegetables'],
    words: ['tomato', 'potato', 'onion', 'chili', 'chilli', 'garlic', 'ginger', 'coriander', 'lemon']
  },
  fruits: {
    title: 'More fresh fruits',
    subtitle: 'Fresh fruit picks for your basket',
    preferred: ['fruits'],
    words: ['apple', 'banana', 'orange', 'grape', 'mango', 'watermelon', 'lemon']
  },
  meat: {
    title: 'Perfect with your meat',
    subtitle: 'Fresh ingredients that pair well with meat',
    preferred: ['vegetables'],
    words: ['onion', 'garlic', 'ginger', 'lemon', 'tomato', 'chili', 'chilli', 'coriander']
  },
  'milk & dairy': {
    title: 'Complete your dairy order',
    subtitle: 'Easy breakfast and dairy picks for your basket',
    preferred: ['milk & dairy'],
    words: ['milk', 'yogurt', 'yoghurt', 'bread', 'egg', 'butter', 'cereal', 'cheese']
  }
};

function categoryForProduct(product) {
  return normalize(product?.category_name);
}

function cartCategories(products, cartItems) {
  return new Set(
    cartItems
      .map(item => products.find(p => Number(p.id) === Number(item.product_id)))
      .map(categoryForProduct)
      .filter(Boolean)
  );
}

function chooseRule(categories) {
  if (categories.has('vegetables')) return RULES.vegetables;
  if (categories.has('fruits')) return RULES.fruits;
  if (categories.has('meat')) return RULES.meat;
  if (categories.has('milk & dairy')) return RULES['milk & dairy'];
  return null;
}

export default function CheckoutRecommendations({
  products = [],
  cartItems = [],
  onAdd,
  onProductPress,
  onSeeAll,
}) {
  const { recommendations, rule } = useMemo(() => {
    const cartIds = new Set(cartItems.map(x => Number(x.product_id)));
    const categories = cartCategories(products, cartItems);
    const activeRule = chooseRule(categories);

    if (!activeRule) return { recommendations: [], rule: null };

    const available = products.filter(product => {
      const id = Number(product.id);
      const stock = Number(product.stock_quantity || 0);
      return id && stock > 0 && !cartIds.has(id);
    });

    const ranked = available
      .map(product => {
        const category = categoryForProduct(product);
        const name = normalize(product.name);
        let score = 0;

        // Strongest signal: products that belong to the recommended category.
        if (activeRule.preferred.includes(category)) score += 100;

        // Next: complementary product names.
        if (activeRule.words.some(word => name.includes(word))) score += 60;

        // If the cart has multiple categories, favor products related to any
        // category already present in the cart.
        if (categories.has(category)) score += 20;

        return { ...product, _recommendationScore: score };
      })
      .filter(product => product._recommendationScore > 0)
      .sort((a, b) => b._recommendationScore - a._recommendationScore)
      .slice(0, 6);

    return { recommendations: ranked, rule: activeRule };
  }, [products, cartItems]);

  if (!rule || !recommendations.length) return null;

  return (
    <View style={styles.section}>
      <SectionTitle
        title={rule.title}
        action="Add more"
        onPress={onSeeAll}
      />

      <View style={styles.headerRow}>
        <View style={styles.iconBubble}>
          <Text style={styles.icon}>✨</Text>
        </View>
        <Text style={styles.subtitle}>{rule.subtitle}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {recommendations.map(product => (
          <View key={product.id} style={styles.card}>
            <ProductCard
              product={product}
              onPress={() => onProductPress?.(product)}
              onAdd={() => onAdd?.(product)}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: -7,
    marginBottom: 10,
  },
  iconBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  icon: {
    fontSize: 14,
  },
  subtitle: {
    flex: 1,
    fontSize: 12,
    color: theme.colors.muted,
  },
  row: {
    gap: 10,
    paddingBottom: 4,
  },
  card: {
    width: 178,
  },
});
