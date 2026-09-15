import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api, apiError } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { theme } from "../theme/theme";
import { Button, Input, Loader } from "../components/UI";
import { screen } from "../utils/screenHelpers";

export function LoginScreen({ navigation }) {
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

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
          secureTextEntry={!showPassword}
          rightIcon={showPassword ? "🙈" : "👁️"}
          onRightIconPress={() => setShowPassword((prev) => !prev)}
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

const s = StyleSheet.create({
  auth: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: theme.colors.background,
  },

  authLogo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 25,
  },

  brand: {
    fontSize: 30,
    fontWeight: "900",
    color: theme.colors.primary,
  },

  h1: {
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 35,
    color: theme.colors.text,
    marginBottom: 8,
  },

  logoLeafSmall: {
    fontSize: 27,
    fontWeight: "900",
    color: "#fff",
  },

  logoMarkSmall: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  p: {
    fontSize: 15,
    lineHeight: 23,
    color: theme.colors.muted,
    marginBottom: 14,
  },
});