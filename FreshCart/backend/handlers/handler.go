package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"freshcart/backend/config"
	"freshcart/backend/services"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type H struct {
	DB *pgxpool.Pool
	C  config.Config
	J  *services.JazzCash
}

func New(db *pgxpool.Pool, c config.Config) *H { return &H{db, c, services.NewJazzCash(c)} }
func err(c *gin.Context, s int, e error)       { c.JSON(s, gin.H{"error": e.Error()}) }
func id(c *gin.Context) int64                  { v, _ := c.Get("user_id"); return v.(int64) }
func slotConflict(c *gin.Context, slotID, riderID int64, start, end, riderName string) {
	message := fmt.Sprintf("Time slot %s - %s is already assigned to Rider %s.", displaySlotTime(start), displaySlotTime(end), riderName)
	c.JSON(409, gin.H{"success": false, "message": message, "slot_id": slotID, "assigned_rider_id": riderID, "assigned_rider_name": riderName, "error": message})
}
func displaySlotTime(value string) string {
	parsed, e := time.Parse("15:04:05", strings.TrimSpace(value))
	if e != nil {
		parsed, e = time.Parse("15:04", strings.TrimSpace(value))
	}
	if e != nil {
		return strings.TrimSuffix(strings.TrimSuffix(value, ":00"), ":00")
	}
	return parsed.Format("3:04 PM")
}
func (h *H) Health(c *gin.Context) { c.JSON(200, gin.H{"ok": true, "service": "FreshCart API"}) }
func (h *H) Area(c *gin.Context) {
	c.JSON(200, gin.H{"city": "Pakistan", "country": "Pakistan", "polygon": h.C.Polygon, "message": "FreshCart delivery coverage is enabled for supported areas."})
}
func (h *H) Register(c *gin.Context) {
	var x struct{ Name, Email, Phone, Password string }
	if c.ShouldBindJSON(&x) != nil || len(x.Name) < 2 || !strings.Contains(x.Email, "@") || len(x.Password) < 8 {
		err(c, 400, fmt.Errorf("valid name, email and password (8+ characters) required"))
		return
	}
	ph, _ := bcrypt.GenerateFromPassword([]byte(x.Password), bcrypt.DefaultCost)
	var uid int64
	var role string
	var active bool
	e := h.DB.QueryRow(c, `INSERT INTO users(name,email,phone,password_hash) VALUES($1,$2,$3,$4) RETURNING id,role,is_active`, x.Name, strings.ToLower(x.Email), x.Phone, string(ph)).Scan(&uid, &role, &active)
	if e != nil {
		err(c, 409, fmt.Errorf("email may already be registered"))
		return
	}
	c.JSON(201, gin.H{"token": h.jwt(uid, role), "user": gin.H{"id": uid, "name": x.Name, "email": strings.ToLower(x.Email), "phone": x.Phone, "role": role, "is_active": active}})
}
func (h *H) Login(c *gin.Context) {
	var x struct{ Email, Password string }
	if c.ShouldBindJSON(&x) != nil {
		err(c, 400, fmt.Errorf("invalid login"))
		return
	}
	var uid int64
	var name, email, phone, hash, role string
	var active bool
	e := h.DB.QueryRow(c, `SELECT id,name,email,COALESCE(phone,''),password_hash,role,is_active FROM users WHERE email=$1`, strings.ToLower(x.Email)).Scan(&uid, &name, &email, &phone, &hash, &role, &active)
	if e != nil || !active || bcrypt.CompareHashAndPassword([]byte(hash), []byte(x.Password)) != nil {
		err(c, 401, fmt.Errorf("invalid email or password"))
		return
	}
	c.JSON(200, gin.H{"token": h.jwt(uid, role), "user": gin.H{"id": uid, "name": name, "email": email, "phone": phone, "role": role, "is_active": active}})
}
func (h *H) jwt(uid int64, role string) string {
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"user_id": uid, "role": role, "exp": time.Now().Add(7 * 24 * time.Hour).Unix()})
	s, _ := t.SignedString([]byte(h.C.JWTSecret))
	return s
}
func (h *H) Categories(c *gin.Context) {
	rows, e := h.DB.Query(c, `SELECT id,name,COALESCE(icon,''),COALESCE(description,''),is_active FROM categories WHERE is_active=true ORDER BY id`)
	if e != nil {
		err(c, 500, e)
		return
	}
	defer rows.Close()
	var out []gin.H
	for rows.Next() {
		var a int64
		var n, i, d string
		var ok bool
		rows.Scan(&a, &n, &i, &d, &ok)
		out = append(out, gin.H{"id": a, "name": n, "icon": i, "description": d, "is_active": ok})
	}
	c.JSON(200, out)
}
func (h *H) AdminCategoryList(c *gin.Context) {
	rows, e := h.DB.Query(c, `SELECT c.id,c.name,COALESCE(c.icon,''),COALESCE(c.description,''),c.is_active,COUNT(p.id) FROM categories c LEFT JOIN products p ON p.category_id=c.id GROUP BY c.id ORDER BY c.id`)
	if e != nil {
		err(c, 500, e)
		return
	}
	defer rows.Close()
	var out []gin.H
	for rows.Next() {
		var id, productCount int64
		var name, icon, description string
		var active bool
		if e = rows.Scan(&id, &name, &icon, &description, &active, &productCount); e != nil {
			err(c, 500, e)
			return
		}
		out = append(out, gin.H{"id": id, "name": name, "icon": icon, "description": description, "is_active": active, "product_count": productCount})
	}
	c.JSON(200, out)
}
func (h *H) Products(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	cat := c.Query("category_id")

	sql := `
		SELECT
			p.id,
			p.category_id,
			c.name,
			p.name,
			COALESCE(p.description, ''),
			COALESCE(p.image_url, ''),
			p.base_price,
			p.unit_type,
			p.stock_quantity,
			p.is_active
		FROM products p
		JOIN categories c ON c.id = p.category_id
		WHERE p.is_active = true
		  AND c.is_active = true
	`

	args := []any{}
	n := 1

	if q != "" {
		sql += fmt.Sprintf(
			` AND (p.name ILIKE $%d OR p.description ILIKE $%d)`,
			n,
			n,
		)

		args = append(args, "%"+q+"%")
		n++
	}

	if cat != "" {
		v, e := strconv.ParseInt(cat, 10, 64)
		if e != nil {
			err(c, 400, e)
			return
		}

		sql += fmt.Sprintf(` AND p.category_id = $%d`, n)
		args = append(args, v)
		n++
	}

	sql += ` ORDER BY p.name`

	rows, e := h.DB.Query(c, sql, args...)
	if e != nil {
		err(c, 500, e)
		return
	}
	defer rows.Close()

	var out []gin.H

	for rows.Next() {
		var id, catid int64
		var name, catname, desc, img, unit string
		var price, stock float64
		var active bool

		if e = rows.Scan(
			&id,
			&catid,
			&catname,
			&name,
			&desc,
			&img,
			&price,
			&unit,
			&stock,
			&active,
		); e != nil {
			err(c, 500, e)
			return
		}

		out = append(out, gin.H{
			"id":             id,
			"category_id":    catid,
			"category_name":  catname,
			"name":           name,
			"description":    desc,
			"image_url":      img,
			"base_price":     price,
			"unit_type":      unit,
			"stock_quantity": stock,
			"is_active":      active,
		})
	}

	if e = rows.Err(); e != nil {
		err(c, 500, e)
		return
	}

	c.JSON(200, out)
}

func (h *H) AdminProductList(c *gin.Context) {
	rows, e := h.DB.Query(
		c,
		`
		SELECT
			p.id,
			p.category_id,
			c.name,
			p.name,
			COALESCE(p.description, ''),
			COALESCE(p.image_url, ''),
			p.base_price,
			p.unit_type,
			p.stock_quantity,
			p.is_active
		FROM products p
		JOIN categories c ON c.id = p.category_id
		ORDER BY p.name
		`,
	)

	if e != nil {
		err(c, 500, e)
		return
	}
	defer rows.Close()

	var out []gin.H

	for rows.Next() {
		var id, catid int64
		var name, catname, desc, img, unit string
		var price, stock float64
		var active bool

		if e = rows.Scan(
			&id,
			&catid,
			&catname,
			&name,
			&desc,
			&img,
			&price,
			&unit,
			&stock,
			&active,
		); e != nil {
			err(c, 500, e)
			return
		}

		out = append(out, gin.H{
			"id":             id,
			"category_id":    catid,
			"category_name":  catname,
			"name":           name,
			"description":    desc,
			"image_url":      img,
			"base_price":     price,
			"unit_type":      unit,
			"stock_quantity": stock,
			"is_active":      active,
		})
	}

	if e = rows.Err(); e != nil {
		err(c, 500, e)
		return
	}

	c.JSON(200, out)
}

func (h *H) Product(c *gin.Context) {
	v, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil {
		err(c, 400, e)
		return
	}

	var id, catid int64
	var name, catname, desc, img, unit string
	var price, stock float64
	var active bool

	e = h.DB.QueryRow(
		c,
		`
		SELECT
			p.id,
			p.category_id,
			c.name,
			p.name,
			COALESCE(p.description, ''),
			COALESCE(p.image_url, ''),
			p.base_price,
			p.unit_type,
			p.stock_quantity,
			p.is_active
		FROM products p
		JOIN categories c ON c.id = p.category_id
		WHERE p.id = $1
		`,
		v,
	).Scan(
		&id,
		&catid,
		&catname,
		&name,
		&desc,
		&img,
		&price,
		&unit,
		&stock,
		&active,
	)

	if e != nil {
		err(c, 404, fmt.Errorf("product not found"))
		return
	}

	c.JSON(200, gin.H{
		"id":             id,
		"category_id":    catid,
		"category_name":  catname,
		"name":           name,
		"description":    desc,
		"image_url":      img,
		"base_price":     price,
		"unit_type":      unit,
		"stock_quantity": stock,
		"is_active":      active,
	})
}
func (h *H) Prices(c *gin.Context) {
	subtotal, _ := strconv.ParseFloat(c.Query("subtotal"), 64)
	settings, e := scanShippingSettings(h.DB.QueryRow(c, `SELECT minimum_order_amount,shipping_fee,shipping_tiers,free_shipping_threshold,currency,free_shipping_enabled FROM shipping_settings WHERE id=1`))
	if e != nil {
		err(c, 500, e)
		return
	}
	p := services.Progress(subtotal, settings)
	p["sizes"] = services.Sizes
	c.JSON(200, p)
}
func (h *H) Slots(c *gin.Context) {
	d := c.Query("date")
	if d == "" {
		d = time.Now().Format("2006-01-02")
	}
	rows, e := h.DB.Query(c, `SELECT id,slot_date::text,start_time::text,end_time::text,max_orders,booked_orders,is_active FROM time_slots WHERE slot_date=$1 AND is_active=true AND booked_orders<max_orders ORDER BY start_time`, d)
	if e != nil {
		err(c, 500, e)
		return
	}
	defer rows.Close()
	var out []gin.H
	for rows.Next() {
		var i, max, b int
		var date, st, en string
		var ok bool
		rows.Scan(&i, &date, &st, &en, &max, &b, &ok)
		out = append(out, gin.H{"id": i, "slot_date": date, "start_time": st, "end_time": en, "max_orders": max, "booked_orders": b, "is_active": ok, "available": b < max})
	}
	c.JSON(200, out)
}
func (h *H) Addresses(c *gin.Context) {
	rows, e := h.DB.Query(c, `SELECT id,label,address_line,city,latitude,longitude,is_default FROM addresses WHERE user_id=$1 ORDER BY is_default DESC,id DESC`, id(c))
	if e != nil {
		err(c, 500, e)
		return
	}
	defer rows.Close()
	var out []gin.H
	for rows.Next() {
		var i int64
		var l, a, city string
		var lat, lng float64
		var def bool
		rows.Scan(&i, &l, &a, &city, &lat, &lng, &def)
		out = append(out, gin.H{"id": i, "label": l, "address_line": a, "city": city, "latitude": lat, "longitude": lng, "is_default": def})
	}
	c.JSON(200, out)
}
func (h *H) CreateAddress(c *gin.Context) {
	var x struct {
		Label       string  `json:"label"`
		AddressLine string  `json:"address_line"`
		Latitude    float64 `json:"latitude"`
		Longitude   float64 `json:"longitude"`
		IsDefault   bool    `json:"is_default"`
	}

	if c.ShouldBindJSON(&x) != nil || x.AddressLine == "" {
		err(c, 400, fmt.Errorf("address is invalid"))
		return
	}

	tx, e := h.DB.Begin(c)
	if e != nil {
		err(c, 500, e)
		return
	}
	defer tx.Rollback(c)

	if x.IsDefault {
		tx.Exec(c, `UPDATE addresses SET is_default=false WHERE user_id=$1`, id(c))
	}

	var aid int64

	e = tx.QueryRow(c,
		`INSERT INTO addresses(
			user_id,
			label,
			address_line,
			city,
			latitude,
			longitude,
			is_default
		) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		id(c),
		x.Label,
		x.AddressLine,
		"City",
		x.Latitude,
		x.Longitude,
		x.IsDefault,
	).Scan(&aid)

	if e != nil {
		err(c, 500, e)
		return
	}

	tx.Commit(c)

	c.JSON(201, gin.H{
		"id":           aid,
		"label":        x.Label,
		"address_line": x.AddressLine,
		"latitude":     x.Latitude,
		"longitude":    x.Longitude,
		"is_default":   x.IsDefault,
	})
}
func (h *H) UpdateAddress(c *gin.Context) {
	addressID, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil {
		err(c, 400, e)
		return
	}
	var x struct {
		Label       string  `json:"label"`
		AddressLine string  `json:"address_line"`
		Latitude    float64 `json:"latitude"`
		Longitude   float64 `json:"longitude"`
		IsDefault   bool    `json:"is_default"`
	}
	x.AddressLine = strings.TrimSpace(x.AddressLine)
	if bindErr := c.ShouldBindJSON(&x); bindErr != nil {
		err(c, 400, fmt.Errorf("invalid address request: %w", bindErr))
		return
	}

	if x.AddressLine == "" {
		err(c, 400, fmt.Errorf("address_line is required"))
		return
	}
	tx, e := h.DB.Begin(c)
	if e != nil {
		err(c, 500, e)
		return
	}
	defer tx.Rollback(c)
	if x.IsDefault {
		_, _ = tx.Exec(c, `UPDATE addresses SET is_default=false WHERE user_id=$1`, id(c))
	}
	_, e = tx.Exec(c, `UPDATE addresses SET label=$1,address_line=$2,latitude=$3,longitude=$4,is_default=$5,updated_at=now() WHERE id=$6 AND user_id=$7`, x.Label, x.AddressLine, x.Latitude, x.Longitude, x.IsDefault, addressID, id(c))
	if e != nil {
		err(c, 500, e)
		return
	}
	if e = tx.Commit(c); e != nil {
		err(c, 500, e)
		return
	}
	c.JSON(200, gin.H{"ok": true})
}

func (h *H) DeleteAddress(c *gin.Context) {
	v, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil {
		err(c, 400, e)
		return
	}
	_, e = h.DB.Exec(c, `DELETE FROM addresses WHERE id=$1 AND user_id=$2`, v, id(c))
	if e != nil {
		err(c, 500, e)
		return
	}
	c.Status(204)
}
func (h *H) CreateOrder(c *gin.Context) {
	var x struct {
		AddressID     int64   `json:"address_id"`
		DeliveryLat   float64 `json:"delivery_lat"`
		DeliveryLng   float64 `json:"delivery_lng"`
		DeliveryDate  string  `json:"delivery_date"`
		TimeSlotID    int64   `json:"time_slot_id"`
		PaymentMethod string  `json:"payment_method"`
		CouponCode    string  `json:"coupon_code"`
		Items         []struct {
			ProductID int64 `json:"product_id"`
			SizeML    int   `json:"size_ml"`
			Quantity  int   `json:"quantity"`
		} `json:"items"`
	}
	if c.ShouldBindJSON(&x) != nil || len(x.Items) == 0 || x.PaymentMethod != "cod" && x.PaymentMethod != "jazzcash" {
		err(c, 400, fmt.Errorf("invalid order or payment method"))
		return
	}
	tx, e := h.DB.Begin(c)
	if e != nil {
		err(c, 500, e)
		return
	}
	defer tx.Rollback(c)
	var addr string
	if e = tx.QueryRow(c, `SELECT address_line FROM addresses WHERE id=$1 AND user_id=$2`, x.AddressID, id(c)).Scan(&addr); e != nil {
		err(c, 400, fmt.Errorf("delivery address not found"))
		return
	}
	var max, booked int
	var slotDate string
	if e = tx.QueryRow(c, `SELECT max_orders,booked_orders,slot_date::text FROM time_slots WHERE id=$1 AND slot_date=$2 AND is_active=true FOR UPDATE`, x.TimeSlotID, x.DeliveryDate).Scan(&max, &booked, &slotDate); e != nil || booked >= max {
		err(c, 409, fmt.Errorf("delivery time slot is full or unavailable"))
		return
	}
	settings, e := scanShippingSettings(tx.QueryRow(c, `SELECT minimum_order_amount,shipping_fee,shipping_tiers,free_shipping_threshold,currency,free_shipping_enabled FROM shipping_settings WHERE id=1 FOR UPDATE`))
	if e != nil {
		err(c, 500, e)
		return
	}
	subtotal := 0.0
	type L struct {
		id                      int64
		name, img, unit         string
		size, qty               int
		unitPrice, total, stock float64
	}
	var lines []L
	for _, it := range x.Items {
		if !services.ValidSize(it.SizeML) || it.Quantity < 1 {
			err(c, 400, fmt.Errorf("invalid product quantity"))
			return
		}
		var p L
		var active bool
		e = tx.QueryRow(c, `SELECT id,name,COALESCE(image_url,''),unit_type,base_price,stock_quantity,is_active FROM products WHERE id=$1 FOR UPDATE`, it.ProductID).Scan(&p.id, &p.name, &p.img, &p.unit, &p.unitPrice, &p.stock, &active)
		if e != nil || !active {
			err(c, 400, fmt.Errorf("product unavailable"))
			return
		}
		need := float64(it.SizeML) / 1000 * float64(it.Quantity)
		if need > p.stock {
			err(c, 409, fmt.Errorf("%s is out of stock", p.name))
			return
		}
		p.size, p.qty = it.SizeML, it.Quantity
		p.total = services.UnitPrice(p.unitPrice, it.SizeML) * float64(it.Quantity)
		p.unitPrice = services.UnitPrice(p.unitPrice, it.SizeML)
		subtotal += p.total
		lines = append(lines, p)
	}
	ship, allowed := services.Shipping(subtotal, settings)
	if !allowed {
		err(c, 400, fmt.Errorf("Minimum order amount is %s %.0f. Please add %s %.0f more to your cart.", settings.Currency, settings.MinimumOrderAmount, settings.Currency, settings.MinimumOrderAmount-subtotal))
		return
	}
	discount := 0.0
	couponCode := strings.ToUpper(strings.TrimSpace(x.CouponCode))
	if couponCode != "" {
		var cp couponView
		e = tx.QueryRow(c, `SELECT id,code,discount_type,discount_value,min_order_amount,max_discount,usage_limit,used_count,starts_at,expires_at,is_active FROM coupons WHERE upper(code)=upper($1) FOR UPDATE`, couponCode).Scan(&cp.ID, &cp.Code, &cp.DiscountType, &cp.DiscountValue, &cp.MinOrderAmount, &cp.MaxDiscount, &cp.UsageLimit, &cp.UsedCount, &cp.StartsAt, &cp.ExpiresAt, &cp.IsActive)
		if e != nil {
			err(c, 400, fmt.Errorf("invalid coupon code"))
			return
		}
		discount, e = couponDiscount(cp, subtotal)
		if e != nil {
			err(c, 400, e)
			return
		}
	}
	finalTotal := subtotal - discount + ship
	num := "FC-" + strings.ToUpper(uuid.NewString()[:8])
	var oid int64
	e = tx.QueryRow(c, `INSERT INTO orders(order_number,user_id,address_id,delivery_address,delivery_latitude,delivery_longitude,delivery_date,time_slot_id,payment_method,status,subtotal,shipping,total,coupon_code,discount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12,$13,$14) RETURNING id`, num, id(c), x.AddressID, addr, x.DeliveryLat, x.DeliveryLng, x.DeliveryDate, x.TimeSlotID, x.PaymentMethod, subtotal, ship, finalTotal, nullableCoupon(couponCode), discount).Scan(&oid)
	if e != nil {
		err(c, 500, e)
		return
	}
	for _, l := range lines {
		if _, e = tx.Exec(c, `INSERT INTO order_items(order_id,product_id,product_name,image_url,unit_type,size_ml,quantity,unit_price,item_total) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, oid, l.id, l.name, l.img, l.unit, l.size, l.qty, l.unitPrice, l.total); e != nil {
			err(c, 500, fmt.Errorf("save order item: %w", e))
			return
		}
		if _, e = tx.Exec(c, `UPDATE products SET stock_quantity=stock_quantity-$1,updated_at=now() WHERE id=$2`, float64(l.size)/1000*float64(l.qty), l.id); e != nil {
			err(c, 500, fmt.Errorf("update product stock: %w", e))
			return
		}
	}
	var assignedRiderID int64
	if e = tx.QueryRow(c, `
		SELECT u.id
		FROM users u
		JOIN riders r ON r.user_id=u.id
		JOIN rider_time_slots rts ON rts.rider_id=u.id AND rts.time_slot_id=$1
		WHERE u.role='rider' AND u.is_active=true AND r.is_available=true
		ORDER BY (
			SELECT COUNT(*) FROM orders active
			WHERE active.rider_id=u.id AND active.status IN ('assigned','out_for_delivery')
		), u.id
		LIMIT 1`, x.TimeSlotID).Scan(&assignedRiderID); e == nil {
		if _, e = tx.Exec(c, `UPDATE orders SET rider_id=$1,status='assigned',updated_at=now() WHERE id=$2`, assignedRiderID, oid); e != nil {
			err(c, 500, e)
			return
		}
	} else if !errors.Is(e, pgx.ErrNoRows) {
		err(c, 500, fmt.Errorf("find available rider: %w", e))
		return
	}
	if _, e = tx.Exec(c, `UPDATE time_slots SET booked_orders=booked_orders+1 WHERE id=$1`, x.TimeSlotID); e != nil {
		err(c, 500, fmt.Errorf("reserve delivery time slot: %w", e))
		return
	}
	if couponCode != "" {
		if _, e = tx.Exec(c, `UPDATE coupons SET used_count=used_count+1,updated_at=now() WHERE upper(code)=upper($1)`, couponCode); e != nil {
			err(c, 500, e)
			return
		}
	}
	if e = tx.Commit(c); e != nil {
		err(c, 500, e)
		return
	}
	// Notify every active admin about the new order. The notification is stored
	// in the same notification center and, when an admin mobile push token exists,
	// is also sent as a push notification.
	adminRows, _ := h.DB.Query(c, `SELECT id FROM users WHERE role='admin' AND is_active=true`)
	if adminRows != nil {
		defer adminRows.Close()
		for adminRows.Next() {
			var adminID int64
			if adminRows.Scan(&adminID) == nil {
				data := map[string]any{"order_id": oid, "order_number": num, "total": finalTotal, "type": "new_order"}
				_ = h.insertNotification(c, adminID, "New Order Received", fmt.Sprintf("Customer placed order %s. Total: Rs. %.0f", num, finalTotal), "new_order", data)
				_ = sendPush(h.pushTokensForUser(c, adminID), "New Order Received", fmt.Sprintf("Customer placed order %s. Total: Rs. %.0f", num, finalTotal), data)
			}
		}
	}
	if assignedRiderID > 0 {
		h.notifyRiderAssignment(c, assignedRiderID, oid)
	}
	createdStatus := "pending"
	if assignedRiderID > 0 {
		createdStatus = "assigned"
	}
	c.JSON(201, gin.H{"order_id": oid, "order_number": num, "subtotal": subtotal, "shipping": ship, "discount": discount, "coupon_code": couponCode, "total": finalTotal, "status": createdStatus})
}
func nullableCoupon(code string) any {
	if code == "" {
		return nil
	}
	return code
}

func (h *H) Orders(c *gin.Context) {
	rows, e := h.DB.Query(c, `SELECT o.id,o.order_number,o.user_id,o.rider_id,o.delivery_address,o.delivery_latitude,o.delivery_longitude,o.delivery_date::text,o.time_slot_id,o.payment_method,o.status,o.subtotal,o.shipping,o.total,o.created_at::text,o.updated_at::text,s.start_time::text,s.end_time::text FROM orders o JOIN time_slots s ON s.id=o.time_slot_id WHERE o.user_id=$1 ORDER BY o.created_at DESC,o.id DESC`, id(c))
	if e != nil {
		err(c, 500, e)
		return
	}
	defer rows.Close()
	var out []gin.H
	for rows.Next() {
		var oid, uid, slot int64
		var rid *int64
		var num, addr, dd, pm, st, ca, ua, slotStart, slotEnd string
		var lat, lng, sub, ship, total float64
		if e = rows.Scan(&oid, &num, &uid, &rid, &addr, &lat, &lng, &dd, &slot, &pm, &st, &sub, &ship, &total, &ca, &ua, &slotStart, &slotEnd); e != nil {
			err(c, 500, e)
			return
		}
		out = append(out, gin.H{"id": oid, "order_number": num, "rider_id": rid, "delivery_address": addr, "delivery_date": dd, "time_slot_id": slot, "slot_start_time": slotStart, "slot_end_time": slotEnd, "payment_method": pm, "status": st, "subtotal": sub, "shipping": ship, "total": total, "created_at": ca, "updated_at": ua})
	}
	if e = rows.Err(); e != nil {
		err(c, 500, e)
		return
	}
	c.JSON(200, out)
}
func (h *H) Order(c *gin.Context) {
	oid, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil {
		err(c, 400, e)
		return
	}
	var o gin.H = gin.H{}
	var uid, slot int64
	var rid *int64
	var num, addr, dd, pm, st, customerName, slotStart, slotEnd string
	var lat, lng, sub, ship, discount, total float64
	e = h.DB.QueryRow(c, `SELECT o.id,o.order_number,o.user_id,o.rider_id,o.delivery_address,o.delivery_latitude,o.delivery_longitude,o.delivery_date::text,o.time_slot_id,o.payment_method,o.status,o.subtotal,o.shipping,o.discount,o.total,u.name,s.start_time::text,s.end_time::text FROM orders o JOIN users u ON u.id=o.user_id JOIN time_slots s ON s.id=o.time_slot_id WHERE o.id=$1`, oid).Scan(&oid, &num, &uid, &rid, &addr, &lat, &lng, &dd, &slot, &pm, &st, &sub, &ship, &discount, &total, &customerName, &slotStart, &slotEnd)
	if e != nil {
		err(c, 404, fmt.Errorf("order not found"))
		return
	}
	role, _ := c.Get("role")
	if uid != id(c) && role != "admin" && (role != "rider" || rid == nil || *rid != id(c)) {
		err(c, 403, fmt.Errorf("not allowed"))
		return
	}
	rows, _ := h.DB.Query(c, `SELECT id,product_id,product_name,COALESCE(image_url,''),unit_type,size_ml,quantity,unit_price,item_total FROM order_items WHERE order_id=$1`, oid)
	defer rows.Close()
	var items []gin.H
	for rows.Next() {
		var iid, pid int64
		var n, img, u string
		var size, q int64
		var up, it float64
		rows.Scan(&iid, &pid, &n, &img, &u, &size, &q, &up, &it)
		items = append(items, gin.H{"id": iid, "product_id": pid, "product_name": n, "image_url": img, "unit_type": u, "size_ml": size, "quantity": q, "unit_price": up, "item_total": it})
	}
	o["id"] = oid
	o["order_number"] = num
	o["user_id"] = uid
	o["customer_name"] = customerName
	o["rider_id"] = rid
	o["delivery_address"] = addr
	o["delivery_latitude"] = lat
	o["delivery_longitude"] = lng
	o["delivery_date"] = dd
	o["time_slot_id"] = slot
	o["slot_start_time"] = slotStart
	o["slot_end_time"] = slotEnd
	o["payment_method"] = pm
	o["status"] = st
	o["subtotal"] = sub
	o["shipping"] = ship
	o["discount"] = discount
	o["total"] = total
	o["items"] = items
	var proofURL, capturedAt string
	if h.DB.QueryRow(c, `SELECT file_url,captured_at::text FROM delivery_proofs WHERE order_id=$1`, oid).Scan(&proofURL, &capturedAt) == nil {
		o["delivery_proof"] = gin.H{"file_url": proofURL, "captured_at": capturedAt}
	} else {
		o["delivery_proof"] = nil
	}
	c.JSON(200, o)
}
func (h *H) JazzInitiate(c *gin.Context) {
	var x struct {
		OrderID int64 `json:"order_id"`
	}
	if c.ShouldBindJSON(&x) != nil {
		err(c, 400, fmt.Errorf("order_id required"))
		return
	}
	var total float64
	var pm string
	if e := h.DB.QueryRow(c, `SELECT total,payment_method FROM orders WHERE id=$1 AND user_id=$2`, x.OrderID, id(c)).Scan(&total, &pm); e != nil || pm != "jazzcash" {
		err(c, 400, fmt.Errorf("JazzCash order not found"))
		return
	}
	b := make([]byte, 6)
	rand.Read(b)
	txn := "FC" + time.Now().Format("20060102150405") + hex.EncodeToString(b)
	if _, e := h.DB.Exec(c, `INSERT INTO payments(order_id,txn_ref,amount) VALUES($1,$2,$3)`, x.OrderID, txn, total); e != nil {
		err(c, 409, fmt.Errorf("payment already initiated"))
		return
	}
	r, e := h.J.Initiate(c, txn, total, fmt.Sprintf("FC-%d", x.OrderID))
	if e != nil {
		h.DB.Exec(c, `UPDATE payments SET status='failed',response_message=$1 WHERE txn_ref=$2`, e.Error(), txn)
		err(c, 502, e)
		return
	}
	raw, _ := json.Marshal(r)
	code, _ := r["pp_ResponseCode"].(string)
	msg, _ := r["pp_ResponseMessage"].(string)
	st := "pending"
	if code == "000" {
		st = "paid"
	}
	h.DB.Exec(c, `UPDATE payments SET status=$1,response_code=$2,response_message=$3,raw_response=$4,updated_at=now() WHERE txn_ref=$5`, st, code, msg, raw, txn)
	c.JSON(200, gin.H{"txn_ref": txn, "status": st, "gateway_response": r})
}
func (h *H) AdminSlotList(c *gin.Context) {
	rows, e := h.DB.Query(c, `SELECT id,slot_date::text,start_time::text,end_time::text,max_orders,booked_orders,is_active FROM time_slots ORDER BY slot_date,start_time`)
	if e != nil {
		err(c, 500, e)
		return
	}
	defer rows.Close()
	var out []gin.H
	for rows.Next() {
		var id, maxOrders, bookedOrders int
		var date, startTime, endTime string
		var active bool
		if e = rows.Scan(&id, &date, &startTime, &endTime, &maxOrders, &bookedOrders, &active); e != nil {
			err(c, 500, e)
			return
		}
		out = append(out, gin.H{"id": id, "date": date, "start_time": startTime, "end_time": endTime, "max_orders": maxOrders, "booked_orders": bookedOrders, "is_active": active})
	}
	c.JSON(200, out)
}
func (h *H) AdminPriceList(c *gin.Context) {
	settings, e := scanShippingSettings(h.DB.QueryRow(c, `SELECT minimum_order_amount,shipping_fee,shipping_tiers,free_shipping_threshold,currency,free_shipping_enabled FROM shipping_settings WHERE id=1`))
	if e != nil {
		err(c, 500, e)
		return
	}
	c.JSON(200, []gin.H{shippingSettingsJSON(settings)})
}
func (h *H) PaymentStatus(c *gin.Context) {
	var id, oid int64
	var txn, gw, st, code, msg, rr string
	var amount float64
	e := h.DB.QueryRow(c, `SELECT id,order_id,txn_ref,gateway,amount,status,COALESCE(response_code,''),COALESCE(response_message,''),COALESCE(retrieval_reference,'') FROM payments WHERE txn_ref=$1`, c.Param("txnRef")).Scan(&id, &oid, &txn, &gw, &amount, &st, &code, &msg, &rr)
	if e != nil {
		err(c, 404, fmt.Errorf("payment not found"))
		return
	}
	c.JSON(200, gin.H{"id": id, "order_id": oid, "txn_ref": txn, "gateway": gw, "amount": amount, "status": st, "response_code": code, "response_message": msg, "retrieval_reference": rr})
}
func (h *H) JazzCallback(c *gin.Context) {
	v := map[string]string{}
	for k, vs := range c.Request.PostForm {
		if len(vs) > 0 {
			v[k] = vs[0]
		}
	}
	if len(v) == 0 {
		var x map[string]any
		if c.ShouldBindJSON(&x) == nil {
			for k, z := range x {
				v[k] = fmt.Sprint(z)
			}
		}
	}
	if !services.Verify(v, h.C.JazzCashSharedSecret) {
		err(c, 401, fmt.Errorf("invalid payment signature"))
		return
	}
	st := "failed"
	if v["pp_ResponseCode"] == "000" {
		st = "paid"
	}
	_, e := h.DB.Exec(c, `UPDATE payments SET status=$1,response_code=$2,response_message=$3,retrieval_reference=$4,updated_at=now() WHERE txn_ref=$5 AND status<>'paid'`, st, v["pp_ResponseCode"], v["pp_ResponseMessage"], v["pp_RetrievalReferenceNo"], v["pp_TxnRefNo"])
	if e != nil {
		err(c, 500, e)
		return
	}
	c.JSON(200, gin.H{"ok": true})
}
func (h *H) RiderOrders(c *gin.Context) {
	rows, e := h.DB.Query(c, `SELECT o.id,o.order_number,o.user_id,o.rider_id,o.delivery_address,o.delivery_latitude,o.delivery_longitude,o.delivery_date::text,o.time_slot_id,o.payment_method,o.status,o.subtotal,o.shipping,o.total,u.name,COALESCE(u.phone,''),s.start_time::text,s.end_time::text FROM orders o JOIN users u ON u.id=o.user_id JOIN time_slots s ON s.id=o.time_slot_id WHERE o.rider_id=$1 ORDER BY o.delivery_date,s.start_time,o.created_at DESC`, id(c))
	if e != nil {
		err(c, 500, e)
		return
	}
	defer rows.Close()
	var out []gin.H
	for rows.Next() {
		var oid, uid, slot int64
		var rid *int64
		var num, addr, dd, pm, st, customerName, customerPhone, slotStart, slotEnd string
		var lat, lng, sub, ship, total float64
		rows.Scan(&oid, &num, &uid, &rid, &addr, &lat, &lng, &dd, &slot, &pm, &st, &sub, &ship, &total, &customerName, &customerPhone, &slotStart, &slotEnd)
		out = append(out, gin.H{"id": oid, "order_number": num, "user_id": uid, "rider_id": rid, "customer_name": customerName, "customer_phone": customerPhone, "delivery_address": addr, "delivery_latitude": lat, "delivery_longitude": lng, "delivery_date": dd, "time_slot_id": slot, "slot_start_time": slotStart, "slot_end_time": slotEnd, "payment_method": pm, "status": st, "subtotal": sub, "shipping": ship, "total": total})
	}
	c.JSON(200, out)
}
func (h *H) RiderStart(c *gin.Context) {
	oid, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil {
		err(c, 400, fmt.Errorf("invalid order"))
		return
	}
	result, e := h.DB.Exec(c, `UPDATE orders SET status='out_for_delivery',updated_at=now() WHERE id=$1 AND rider_id=$2 AND status IN('assigned','confirmed','preparing')`, oid, id(c))
	if e != nil {
		err(c, 500, e)
		return
	}
	if result.RowsAffected() == 0 {
		err(c, 409, fmt.Errorf("order is not assigned to you or cannot start delivery"))
		return
	}
	c.JSON(200, gin.H{"ok": true})
}

func (h *H) RiderStatus(c *gin.Context) {
	oid, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil {
		err(c, 400, fmt.Errorf("invalid order"))
		return
	}
	var x struct {
		Status string `json:"status"`
	}
	if c.ShouldBindJSON(&x) != nil {
		err(c, 400, fmt.Errorf("status required"))
		return
	}
	allowed := map[string]bool{"accepted": true, "preparing": true, "out_for_delivery": true, "failed": true}
	if !allowed[x.Status] {
		err(c, 400, fmt.Errorf("rider cannot set this status"))
		return
	}
	var current string
	if e = h.DB.QueryRow(c, `SELECT status FROM orders WHERE id=$1 AND rider_id=$2`, oid, id(c)).Scan(&current); e != nil {
		err(c, 404, fmt.Errorf("assigned order not found"))
		return
	}
	valid := (current == "assigned" && x.Status == "accepted") || (current == "accepted" && x.Status == "preparing") || (current == "preparing" && x.Status == "out_for_delivery") || (current == "out_for_delivery" && x.Status == "failed")
	if !valid {
		err(c, 409, fmt.Errorf("invalid status transition from %s to %s", current, x.Status))
		return
	}
	if _, e = h.DB.Exec(c, `UPDATE orders SET status=$1,updated_at=now() WHERE id=$2 AND rider_id=$3`, x.Status, oid, id(c)); e != nil {
		err(c, 500, e)
		return
	}
	c.JSON(200, gin.H{"ok": true, "status": x.Status})
}
func (h *H) RiderPhoto(c *gin.Context) {
	oid, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil {
		err(c, 400, fmt.Errorf("invalid order"))
		return
	}
	var orderStatus string
	if e = h.DB.QueryRow(c, `SELECT status FROM orders WHERE id=$1 AND rider_id=$2`, oid, id(c)).Scan(&orderStatus); e != nil {
		err(c, 404, fmt.Errorf("assigned order not found"))
		return
	}
	if orderStatus != "out_for_delivery" {
		err(c, 409, fmt.Errorf("start delivery before uploading proof"))
		return
	}
	f, e := c.FormFile("photo")
	if e != nil {
		err(c, 400, fmt.Errorf("photo required"))
		return
	}
	os.MkdirAll(h.C.UploadDir, 0755)
	name := uuid.NewString() + filepath.Ext(f.Filename)
	path := filepath.Join(h.C.UploadDir, name)
	if e = c.SaveUploadedFile(f, path); e != nil {
		err(c, 500, e)
		return
	}
	url := h.C.PublicBaseURL + "/uploads/" + name
	_, e = h.DB.Exec(c, `INSERT INTO delivery_proofs(order_id,rider_id,file_url) VALUES($1,$2,$3) ON CONFLICT(order_id) DO UPDATE SET file_url=excluded.file_url,rider_id=excluded.rider_id,captured_at=now()`, oid, id(c), url)
	if e != nil {
		err(c, 500, e)
		return
	}
	c.JSON(201, gin.H{"file_url": url})
}
func (h *H) RiderComplete(c *gin.Context) {
	oid, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil {
		err(c, 400, fmt.Errorf("invalid order"))
		return
	}
	var n int
	e = h.DB.QueryRow(c, `SELECT COUNT(*) FROM delivery_proofs p JOIN orders o ON o.id=p.order_id WHERE p.order_id=$1 AND p.rider_id=$2 AND o.rider_id=$2 AND o.status='out_for_delivery'`, oid, id(c)).Scan(&n)
	if e != nil {
		err(c, 500, e)
		return
	}
	if n == 0 {
		err(c, 400, fmt.Errorf("delivery proof photo is required"))
		return
	}
	var userID int64
	e = h.DB.QueryRow(c, `UPDATE orders SET status='delivered',updated_at=now() WHERE id=$1 AND rider_id=$2 AND status='out_for_delivery' RETURNING user_id`, oid, id(c)).Scan(&userID)
	if e != nil {
		err(c, 409, fmt.Errorf("order is not ready to be completed"))
		return
	}
	var orderNumber string
	_ = h.DB.QueryRow(c, `SELECT order_number FROM orders WHERE id=$1`, oid).Scan(&orderNumber)
	data := map[string]any{"order_id": oid, "order_number": orderNumber, "type": "order_delivered"}
	message := fmt.Sprintf("Your FreshCart order %s has been delivered successfully.", orderNumber)
	_ = h.insertNotification(c, userID, "Order Delivered 🎉", message, "order_delivered", data)
	_ = sendPush(h.pushTokensForUser(c, userID), "Order Delivered 🎉", message, data)
	c.JSON(200, gin.H{"ok": true})
}
func (h *H) AdminDashboard(c *gin.Context) {
	var orders, customers, products int
	var revenue float64
	h.DB.QueryRow(c, `SELECT COUNT(*) FROM orders`).Scan(&orders)
	h.DB.QueryRow(c, `SELECT COALESCE(SUM(total),0) FROM orders WHERE status<>'cancelled'`).Scan(&revenue)
	h.DB.QueryRow(c, `SELECT COUNT(*) FROM users WHERE role='customer'`).Scan(&customers)
	h.DB.QueryRow(c, `SELECT COUNT(*) FROM products WHERE is_active`).Scan(&products)
	c.JSON(200, gin.H{"orders": orders, "revenue": revenue, "customers": customers, "products": products})
}
func (h *H) AdminProducts(c *gin.Context) {
	var x struct {
		CategoryID    int64   `json:"category_id"`
		Name          string  `json:"name"`
		Description   string  `json:"description"`
		ImageURL      string  `json:"image_url"`
		UnitType      string  `json:"unit_type"`
		BasePrice     float64 `json:"base_price"`
		StockQuantity float64 `json:"stock_quantity"`
		IsActive      bool    `json:"is_active"`
	}
	if c.ShouldBindJSON(&x) != nil || x.Name == "" || x.CategoryID < 1 || x.BasePrice < 0 || x.StockQuantity < 0 || (x.UnitType != "kg" && x.UnitType != "liter") {
		err(c, 400, fmt.Errorf("invalid product"))
		return
	}
	if !x.IsActive {
		x.IsActive = true
	}
	var pid int64
	e := h.DB.QueryRow(c, `INSERT INTO products(category_id,name,description,image_url,base_price,unit_type,stock_quantity,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, x.CategoryID, x.Name, x.Description, x.ImageURL, x.BasePrice, x.UnitType, x.StockQuantity, x.IsActive).Scan(&pid)
	if e != nil {
		err(c, 400, e)
		return
	}
	c.JSON(201, gin.H{"id": pid})
}
func (h *H) AdminUpdateProduct(c *gin.Context) {
	pid, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var x struct {
		CategoryID    int64   `json:"category_id"`
		Name          string  `json:"name"`
		Description   string  `json:"description"`
		ImageURL      string  `json:"image_url"`
		UnitType      string  `json:"unit_type"`
		BasePrice     float64 `json:"base_price"`
		StockQuantity float64 `json:"stock_quantity"`
		IsActive      bool    `json:"is_active"`
	}
	if c.ShouldBindJSON(&x) != nil {
		err(c, 400, fmt.Errorf("invalid product"))
		return
	}
	var oldName, oldImage, oldUnit string
	var oldPrice float64
	if e := h.DB.QueryRow(c, `SELECT name,COALESCE(image_url,''),unit_type,base_price FROM products WHERE id=$1`, pid).Scan(&oldName, &oldImage, &oldUnit, &oldPrice); e != nil {
		err(c, 404, fmt.Errorf("product not found"))
		return
	}
	_, e := h.DB.Exec(c, `UPDATE products SET category_id=$1,name=$2,description=$3,image_url=$4,base_price=$5,unit_type=$6,stock_quantity=$7,is_active=$8,updated_at=now() WHERE id=$9`, x.CategoryID, x.Name, x.Description, x.ImageURL, x.BasePrice, x.UnitType, x.StockQuantity, x.IsActive, pid)
	if e != nil {
		err(c, 500, e)
		return
	}
	sent, failed := 0, 0
	if x.BasePrice != oldPrice {
		sent, failed = h.notifyPriceUpdate(c, pid, x.Name, x.ImageURL, x.UnitType, oldPrice, x.BasePrice, "")
	}
	c.JSON(200, gin.H{"ok": true, "sent": sent, "failed": failed})
}
func (h *H) AdminDeleteProduct(c *gin.Context) {
	pid, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	_, e := h.DB.Exec(c, `UPDATE products SET is_active=false,updated_at=now() WHERE id=$1`, pid)
	if e != nil {
		err(c, 500, e)
		return
	}
	c.Status(204)
}
func scanShippingSettings(row interface{ Scan(...any) error }) (services.ShippingSettings, error) {
	var settings services.ShippingSettings
	var tiersJSON []byte
	e := row.Scan(&settings.MinimumOrderAmount, &settings.ShippingFee, &tiersJSON, &settings.FreeShippingThreshold, &settings.Currency, &settings.FreeShippingEnabled)
	if e != nil {
		return settings, e
	}
	if len(tiersJSON) > 0 {
		e = json.Unmarshal(tiersJSON, &settings.ShippingTiers)
	}
	return settings, e
}
func shippingSettingsJSON(settings services.ShippingSettings) gin.H {
	return gin.H{"minimum_order_amount": settings.MinimumOrderAmount, "shipping_fee": settings.ShippingFee, "shipping_tiers": settings.ShippingTiers, "free_shipping_threshold": settings.FreeShippingThreshold, "currency": settings.Currency, "free_shipping_enabled": settings.FreeShippingEnabled}
}
func (h *H) ShippingSettings(c *gin.Context) {
	settings, e := scanShippingSettings(h.DB.QueryRow(c, `SELECT minimum_order_amount,shipping_fee,shipping_tiers,free_shipping_threshold,currency,free_shipping_enabled FROM shipping_settings WHERE id=1`))
	if e != nil {
		err(c, 500, e)
		return
	}
	c.JSON(200, shippingSettingsJSON(settings))
}
func (h *H) AdminShippingSettings(c *gin.Context) {
	settings, e := scanShippingSettings(h.DB.QueryRow(c, `SELECT minimum_order_amount,shipping_fee,shipping_tiers,free_shipping_threshold,currency,free_shipping_enabled FROM shipping_settings WHERE id=1`))
	if e != nil {
		err(c, 500, e)
		return
	}
	c.JSON(200, shippingSettingsJSON(settings))
}
func (h *H) AdminUpdateShippingSettings(c *gin.Context) {
	var x struct {
		MinimumOrderAmount    float64                 `json:"minimum_order_amount"`
		ShippingFee           float64                 `json:"shipping_fee"`
		ShippingTiers         []services.ShippingTier `json:"shipping_tiers"`
		FreeShippingThreshold float64                 `json:"free_shipping_threshold"`
		Currency              string                  `json:"currency"`
		FreeShippingEnabled   bool                    `json:"free_shipping_enabled"`
	}
	if c.ShouldBindJSON(&x) != nil || x.MinimumOrderAmount < 0 || x.ShippingFee < 0 || x.FreeShippingThreshold < 0 || strings.TrimSpace(x.Currency) == "" || !validShippingTiers(x.ShippingTiers, x.MinimumOrderAmount) {
		err(c, 400, fmt.Errorf("valid shipping settings are required"))
		return
	}
	x.Currency = strings.ToUpper(strings.TrimSpace(x.Currency))
	if x.FreeShippingEnabled && x.FreeShippingThreshold < x.MinimumOrderAmount {
		err(c, 400, fmt.Errorf("free shipping threshold must be at least the minimum order amount"))
		return
	}
	tiersJSON, _ := json.Marshal(x.ShippingTiers)
	_, e := h.DB.Exec(c, `UPDATE shipping_settings SET minimum_order_amount=$1,shipping_fee=$2,shipping_tiers=$3::jsonb,free_shipping_threshold=$4,currency=$5,free_shipping_enabled=$6,updated_by=$7,updated_at=now() WHERE id=1`, x.MinimumOrderAmount, x.ShippingFee, string(tiersJSON), x.FreeShippingThreshold, x.Currency, x.FreeShippingEnabled, id(c))
	if e != nil {
		err(c, 500, e)
		return
	}
	c.JSON(200, gin.H{"success": true, "message": "Shipping settings updated successfully.", "settings": shippingSettingsJSON(services.ShippingSettings{MinimumOrderAmount: x.MinimumOrderAmount, ShippingFee: x.ShippingFee, ShippingTiers: x.ShippingTiers, FreeShippingThreshold: x.FreeShippingThreshold, Currency: x.Currency, FreeShippingEnabled: x.FreeShippingEnabled})})
}

func validShippingTiers(tiers []services.ShippingTier, minimumOrder float64) bool {
	if len(tiers) == 0 || tiers[0].MinAmount != minimumOrder {
		return false
	}
	for i, tier := range tiers {
		if tier.MinAmount < minimumOrder || tier.Fee < 0 || (tier.MaxAmount != 0 && tier.MaxAmount <= tier.MinAmount) {
			return false
		}
		if i < len(tiers)-1 && (tier.MaxAmount == 0 || tier.MaxAmount != tiers[i+1].MinAmount) {
			return false
		}
		if i == len(tiers)-1 && tier.MaxAmount != 0 {
			return false
		}
	}
	return true
}
func (h *H) AdminProductImage(c *gin.Context) {
	pid, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	f, e := c.FormFile("image")
	if e != nil {
		err(c, 400, fmt.Errorf("image required"))
		return
	}
	os.MkdirAll(h.C.UploadDir, 0755)
	name := uuid.NewString() + filepath.Ext(f.Filename)
	path := filepath.Join(h.C.UploadDir, name)
	if e = c.SaveUploadedFile(f, path); e != nil {
		err(c, 500, e)
		return
	}
	url := h.C.PublicBaseURL + "/uploads/" + name
	h.DB.Exec(c, `UPDATE products SET image_url=$1 WHERE id=$2`, url, pid)
	c.JSON(200, gin.H{"image_url": url})
}
func (h *H) AdminOrders(c *gin.Context) {
	query := `SELECT o.id,o.order_number,o.user_id,o.rider_id,o.delivery_address,o.delivery_date::text,o.time_slot_id,s.start_time::text,s.end_time::text,o.payment_method,o.status,o.subtotal,o.shipping,o.total,COALESCE(r.name,''),COALESCE(u.name,''),COALESCE(u.email,'') FROM orders o JOIN time_slots s ON s.id=o.time_slot_id JOIN users u ON u.id=o.user_id LEFT JOIN users r ON r.id=o.rider_id WHERE 1=1`
	args := []any{}
	add := func(condition string, value any) {
		query += fmt.Sprintf(" AND %s", condition)
		args = append(args, value)
	}
	if value := strings.TrimSpace(c.Query("date")); value != "" {
		add(fmt.Sprintf("o.delivery_date=$%d", len(args)+1), value)
	}
	if value := strings.TrimSpace(c.Query("slot_id")); value != "" {
		add(fmt.Sprintf("o.time_slot_id=$%d", len(args)+1), value)
	}
	if value := strings.TrimSpace(c.Query("rider_id")); value != "" {
		add(fmt.Sprintf("o.rider_id=$%d", len(args)+1), value)
	}
	if value := strings.TrimSpace(c.Query("status")); value != "" {
		add(fmt.Sprintf("o.status=$%d", len(args)+1), value)
	}
	if value := strings.TrimSpace(c.Query("customer")); value != "" {
		add(fmt.Sprintf("(u.name ILIKE $%d OR u.email ILIKE $%d OR o.order_number ILIKE $%d)", len(args)+1, len(args)+1, len(args)+1), "%"+value+"%")
	}
	query += ` ORDER BY o.delivery_date DESC,s.start_time,o.created_at DESC`
	rows, e := h.DB.Query(c, query, args...)
	if e != nil {
		err(c, 500, e)
		return
	}
	defer rows.Close()
	var out []gin.H
	for rows.Next() {
		var oid, uid int64
		var rid *int64
		var num, addr, date, slotStart, slotEnd, pm, st, riderName, customerName, customerEmail string
		var slotID int64
		var sub, ship, total float64
		if e = rows.Scan(&oid, &num, &uid, &rid, &addr, &date, &slotID, &slotStart, &slotEnd, &pm, &st, &sub, &ship, &total, &riderName, &customerName, &customerEmail); e != nil {
			err(c, 500, e)
			return
		}
		out = append(out, gin.H{"id": oid, "order_number": num, "user_id": uid, "customer_name": customerName, "customer_email": customerEmail, "rider_id": rid, "rider_name": riderName, "delivery_address": addr, "delivery_date": date, "time_slot_id": slotID, "slot_start_time": slotStart, "slot_end_time": slotEnd, "payment_method": pm, "status": st, "subtotal": sub, "shipping": ship, "total": total})
	}
	c.JSON(200, out)
}
func (h *H) AdminOrderStatus(c *gin.Context) {
	oid, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var x struct {
		Status string `json:"status"`
	}
	c.ShouldBindJSON(&x)
	ok := false
	for _, s := range []string{"pending", "confirmed", "preparing", "assigned", "out_for_delivery", "delivered", "cancelled"} {
		if x.Status == s {
			ok = true
		}
	}
	if !ok {
		err(c, 400, fmt.Errorf("invalid status"))
		return
	}
	if x.Status == "delivered" {
		var proofCount int
		if e := h.DB.QueryRow(c, `SELECT COUNT(*) FROM delivery_proofs WHERE order_id=$1`, oid).Scan(&proofCount); e != nil {
			err(c, 500, e)
			return
		}
		if proofCount == 0 {
			err(c, 400, fmt.Errorf("delivery proof photo is required before marking delivered"))
			return
		}
	}
	var userID int64
	var orderNumber, previousStatus string
	e := h.DB.QueryRow(c, `SELECT user_id,order_number,status FROM orders WHERE id=$1`, oid).Scan(&userID, &orderNumber, &previousStatus)
	if e != nil {
		err(c, 404, fmt.Errorf("order not found"))
		return
	}
	_, e = h.DB.Exec(c, `UPDATE orders SET status=$1,updated_at=now() WHERE id=$2`, x.Status, oid)
	if e != nil {
		err(c, 500, e)
		return
	}
	if x.Status == "delivered" && previousStatus != "delivered" {
		data := map[string]any{"order_id": oid, "order_number": orderNumber, "type": "order_delivered"}
		message := fmt.Sprintf("Your FreshCart order %s (ID: %d) has been delivered successfully.", orderNumber, oid)
		_ = h.insertNotification(c, userID, "Order Delivered", message, "order_delivered", data)
		_ = sendPush(h.pushTokensForUser(c, userID), "Order Delivered", message, data)
	}
	c.JSON(200, gin.H{"ok": true})
}
func (h *H) AdminRiders(c *gin.Context) {
	rows, e := h.DB.Query(c, `SELECT u.id,u.name,u.email,COALESCE(u.phone,''),u.is_active,COALESCE(r.vehicle_type,r.vehicle,''),COALESCE(r.vehicle_number,''),COALESCE(r.is_available,true),COUNT(o.id) FILTER (WHERE o.status IN ('assigned','out_for_delivery')) FROM users u JOIN riders r ON r.user_id=u.id LEFT JOIN orders o ON o.rider_id=u.id WHERE u.role='rider' GROUP BY u.id,r.id ORDER BY u.name`)
	if e != nil {
		err(c, 500, e)
		return
	}
	defer rows.Close()
	var out []gin.H
	for rows.Next() {
		var i int64
		var n, em, ph, vehicleType, vehicleNumber string
		var a, av bool
		var activeOrders int
		rows.Scan(&i, &n, &em, &ph, &a, &vehicleType, &vehicleNumber, &av, &activeOrders)
		out = append(out, gin.H{"id": i, "name": n, "email": em, "phone": ph, "is_active": a, "vehicle_type": vehicleType, "vehicle_number": vehicleNumber, "vehicle": vehicleType, "is_available": av, "active_orders": activeOrders})
	}
	c.JSON(200, out)
}
func (h *H) AdminAddRider(c *gin.Context) {
	var x struct {
		Name          string `json:"name"`
		Email         string `json:"email"`
		Phone         string `json:"phone"`
		Password      string `json:"password"`
		VehicleType   string `json:"vehicle_type"`
		Vehicle       string `json:"vehicle"`
		VehicleNumber string `json:"vehicle_number"`
		IsActive      bool   `json:"is_active"`
		IsAvailable   bool   `json:"is_available"`
	}
	if c.ShouldBindJSON(&x) != nil {
		err(c, 400, fmt.Errorf("valid rider data required"))
		return
	}
	x.Name = strings.TrimSpace(x.Name)
	x.Email = strings.ToLower(strings.TrimSpace(x.Email))
	x.Phone = strings.TrimSpace(x.Phone)
	x.VehicleType = strings.TrimSpace(x.VehicleType)
	if x.VehicleType == "" {
		x.VehicleType = strings.TrimSpace(x.Vehicle)
	}
	x.VehicleNumber = strings.TrimSpace(x.VehicleNumber)
	if x.Name == "" || !strings.Contains(x.Email, "@") || len(x.Password) < 8 {
		err(c, 400, fmt.Errorf("valid rider data required"))
		return
	}
	if !x.IsActive {
		x.IsActive = true
	}
	ph, _ := bcrypt.GenerateFromPassword([]byte(x.Password), bcrypt.DefaultCost)
	tx, e := h.DB.Begin(c)
	if e != nil {
		err(c, 500, e)
		return
	}
	defer tx.Rollback(c)
	var uid int64
	e = tx.QueryRow(c, `INSERT INTO users(name,email,phone,password_hash,role,is_active) VALUES($1,$2,$3,$4,'rider',$5) RETURNING id`, x.Name, x.Email, x.Phone, string(ph), x.IsActive).Scan(&uid)
	if e != nil {
		err(c, 409, e)
		return
	}
	if _, e = tx.Exec(c, `INSERT INTO riders(user_id,vehicle,vehicle_type,vehicle_number,is_available) VALUES($1,$2,$3,$4,$5)`, uid, x.VehicleType, x.VehicleType, x.VehicleNumber, x.IsAvailable); e != nil {
		err(c, 500, e)
		return
	}
	tx.Commit(c)
	c.JSON(201, gin.H{"id": uid})
}
func (h *H) AdminUpdateRider(c *gin.Context) {
	uid, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var x struct {
		Name          string `json:"name"`
		Email         string `json:"email"`
		Phone         string `json:"phone"`
		Password      string `json:"password"`
		VehicleType   string `json:"vehicle_type"`
		VehicleNumber string `json:"vehicle_number"`
		IsActive      bool   `json:"is_active"`
		IsAvailable   bool   `json:"is_available"`
	}
	if c.ShouldBindJSON(&x) != nil {
		err(c, 400, fmt.Errorf("invalid rider"))
		return
	}
	if strings.TrimSpace(x.Name) == "" || !strings.Contains(x.Email, "@") {
		err(c, 400, fmt.Errorf("valid rider data required"))
		return
	}
	result, e := h.DB.Exec(c, `UPDATE users SET name=$1,email=$2,phone=$3,is_active=$4,updated_at=now() WHERE id=$5 AND role='rider'`, strings.TrimSpace(x.Name), strings.ToLower(strings.TrimSpace(x.Email)), strings.TrimSpace(x.Phone), x.IsActive, uid)
	if e != nil {
		err(c, 409, fmt.Errorf("rider email may already be registered"))
		return
	}
	if result.RowsAffected() == 0 {
		err(c, 404, fmt.Errorf("rider not found"))
		return
	}
	if x.Password != "" {
		if len(x.Password) < 8 {
			err(c, 400, fmt.Errorf("password must be at least 8 characters"))
			return
		}
		hash, _ := bcrypt.GenerateFromPassword([]byte(x.Password), bcrypt.DefaultCost)
		if _, e = h.DB.Exec(c, `UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2`, string(hash), uid); e != nil {
			err(c, 500, e)
			return
		}
	}
	if _, e = h.DB.Exec(c, `UPDATE riders SET vehicle=$1,vehicle_type=$2,vehicle_number=$3,is_available=$4 WHERE user_id=$5`, x.VehicleType, x.VehicleType, x.VehicleNumber, x.IsAvailable, uid); e != nil {
		err(c, 500, e)
		return
	}
	c.JSON(200, gin.H{"ok": true})
}
func (h *H) AdminDeleteRider(c *gin.Context) {
	uid, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil {
		err(c, 400, fmt.Errorf("invalid rider"))
		return
	}
	result, e := h.DB.Exec(c, `UPDATE users SET is_active=false,updated_at=now() WHERE id=$1 AND role='rider'`, uid)
	if e != nil {
		err(c, 500, e)
		return
	}
	if result.RowsAffected() == 0 {
		err(c, 404, fmt.Errorf("rider not found"))
		return
	}
	h.DB.Exec(c, `UPDATE riders SET is_available=false WHERE user_id=$1`, uid)
	c.Status(204)
}
func (h *H) AdminAssign(c *gin.Context) {
	oid, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil {
		err(c, 400, fmt.Errorf("invalid order"))
		return
	}
	var x struct {
		RiderID int64 `json:"rider_id"`
	}
	if c.ShouldBindJSON(&x) != nil {
		err(c, 400, fmt.Errorf("rider_id required"))
		return
	}
	var slotID int64
	var orderNumber string
	if e = h.DB.QueryRow(c, `SELECT time_slot_id,order_number FROM orders WHERE id=$1 AND status NOT IN ('delivered','cancelled')`, oid).Scan(&slotID, &orderNumber); e != nil {
		err(c, 404, fmt.Errorf("order not found or already closed"))
		return
	}
	var eligible bool
	e = h.DB.QueryRow(c, `SELECT EXISTS(SELECT 1 FROM users u JOIN riders r ON r.user_id=u.id JOIN rider_time_slots rts ON rts.rider_id=u.id WHERE u.id=$1 AND u.role='rider' AND u.is_active=true AND r.is_available=true AND rts.time_slot_id=$2)`, x.RiderID, slotID).Scan(&eligible)
	if e != nil {
		err(c, 500, e)
		return
	}
	if !eligible {
		err(c, 409, fmt.Errorf("rider is not eligible for this delivery slot"))
		return
	}
	_, e = h.DB.Exec(c, `UPDATE orders SET rider_id=$1,status=CASE WHEN status IN ('pending','confirmed','preparing') THEN 'assigned' ELSE status END,updated_at=now() WHERE id=$2`, x.RiderID, oid)
	if e != nil {
		err(c, 500, e)
		return
	}
	h.notifyRiderAssignment(c, x.RiderID, oid)
	_ = orderNumber
	c.JSON(200, gin.H{"ok": true})
}
func (h *H) AdminEligibleRiders(c *gin.Context) {
	oid, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil {
		err(c, 400, fmt.Errorf("invalid order"))
		return
	}
	var slotID int64
	if e = h.DB.QueryRow(c, `SELECT time_slot_id FROM orders WHERE id=$1`, oid).Scan(&slotID); e != nil {
		err(c, 404, fmt.Errorf("order not found"))
		return
	}
	rows, e := h.DB.Query(c, `SELECT u.id,u.name,COALESCE(u.phone,''),COALESCE(r.vehicle_type,r.vehicle,''),COALESCE(r.vehicle_number,''),COUNT(o.id) FILTER (WHERE o.status IN ('assigned','out_for_delivery')) FROM users u JOIN riders r ON r.user_id=u.id JOIN rider_time_slots rts ON rts.rider_id=u.id AND rts.time_slot_id=$1 LEFT JOIN orders o ON o.rider_id=u.id WHERE u.role='rider' AND u.is_active=true AND r.is_available=true GROUP BY u.id,r.id ORDER BY COUNT(o.id) FILTER (WHERE o.status IN ('assigned','out_for_delivery')),u.name`, slotID)
	if e != nil {
		err(c, 500, e)
		return
	}
	defer rows.Close()
	var out []gin.H
	for rows.Next() {
		var riderID, activeOrders int64
		var name, phone, vehicleType, vehicleNumber string
		if e = rows.Scan(&riderID, &name, &phone, &vehicleType, &vehicleNumber, &activeOrders); e == nil {
			out = append(out, gin.H{"id": riderID, "name": name, "phone": phone, "vehicle_type": vehicleType, "vehicle_number": vehicleNumber, "active_orders": activeOrders})
		}
	}
	c.JSON(200, out)
}
func (h *H) AdminRiderSlots(c *gin.Context) {
	riderID, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil {
		err(c, 400, fmt.Errorf("invalid rider"))
		return
	}
	date := strings.TrimSpace(c.Query("date"))
	query := `SELECT s.id,s.slot_date::text,s.start_time::text,s.end_time::text,s.is_active,(rts.id IS NOT NULL) FROM time_slots s LEFT JOIN rider_time_slots rts ON rts.time_slot_id=s.id AND rts.rider_id=$1`
	args := []any{riderID}
	if date != "" {
		query += ` WHERE s.slot_date=$2`
		args = append(args, date)
	}
	query += ` ORDER BY s.slot_date,s.start_time`
	rows, e := h.DB.Query(c, query, args...)
	if e != nil {
		err(c, 500, e)
		return
	}
	defer rows.Close()
	var out []gin.H
	for rows.Next() {
		var slotID int64
		var date, start, end string
		var active, assigned bool
		if rows.Scan(&slotID, &date, &start, &end, &active, &assigned) == nil {
			out = append(out, gin.H{"id": slotID, "slot_date": date, "start_time": start, "end_time": end, "is_active": active, "assigned": assigned})
		}
	}
	c.JSON(200, out)
}
func (h *H) AdminSlotAvailability(c *gin.Context) {
	date := strings.TrimSpace(c.Query("date"))
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	rows, e := h.DB.Query(c, `SELECT s.id,s.slot_date::text,s.start_time::text,s.end_time::text,s.is_active,rts.rider_id,COALESCE(u.name,'') FROM time_slots s LEFT JOIN rider_time_slots rts ON rts.time_slot_id=s.id LEFT JOIN users u ON u.id=rts.rider_id WHERE s.slot_date=$1 ORDER BY s.start_time`, date)
	if e != nil {
		err(c, 500, e)
		return
	}
	defer rows.Close()
	var out []gin.H
	for rows.Next() {
		var slotID int64
		var slotDate, start, end, riderName string
		var active bool
		var riderID *int64
		if e = rows.Scan(&slotID, &slotDate, &start, &end, &active, &riderID, &riderName); e != nil {
			err(c, 500, e)
			return
		}
		var assigned any
		if riderID != nil {
			assigned = gin.H{"id": *riderID, "name": riderName}
		}
		out = append(out, gin.H{"slot_id": slotID, "slot_date": slotDate, "start_time": start, "end_time": end, "is_active": active, "time": fmt.Sprintf("%s - %s", displaySlotTime(start), displaySlotTime(end)), "available": active && riderID == nil, "assigned_rider": assigned})
	}
	c.JSON(200, out)
}
func (h *H) AdminAssignSlot(c *gin.Context) {
	riderID, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil {
		err(c, 400, fmt.Errorf("invalid rider"))
		return
	}
	var x struct {
		TimeSlotID int64 `json:"time_slot_id"`
	}
	if c.ShouldBindJSON(&x) != nil || x.TimeSlotID < 1 {
		err(c, 400, fmt.Errorf("time_slot_id required"))
		return
	}
	var valid bool
	if e = h.DB.QueryRow(c, `SELECT EXISTS(SELECT 1 FROM users u JOIN riders r ON r.user_id=u.id WHERE u.id=$1 AND u.role='rider' AND u.is_active=true) AND EXISTS(SELECT 1 FROM time_slots WHERE id=$2 AND is_active=true)`, riderID, x.TimeSlotID).Scan(&valid); e != nil {
		err(c, 500, e)
		return
	}
	if !valid {
		err(c, 409, fmt.Errorf("rider must be active and the time slot must be active"))
		return
	}
	tx, e := h.DB.Begin(c)
	if e != nil {
		err(c, 500, e)
		return
	}
	defer tx.Rollback(c)
	if _, e = tx.Exec(c, `SELECT id FROM time_slots WHERE id=$1 FOR UPDATE`, x.TimeSlotID); e != nil {
		err(c, 500, e)
		return
	}
	var assigned bool
	var assignedRider string
	if e = tx.QueryRow(c, `SELECT EXISTS(SELECT 1 FROM rider_time_slots rts WHERE rts.rider_id=$1 AND rts.time_slot_id=$2), COALESCE((SELECT u.name FROM rider_time_slots rts JOIN users u ON u.id=rts.rider_id WHERE rts.time_slot_id=$2 AND rts.rider_id<>$1 LIMIT 1),'')`, riderID, x.TimeSlotID).Scan(&assigned, &assignedRider); e != nil {
		err(c, 500, e)
		return
	}
	if assignedRider != "" {
		var assignedRiderID int64
		var start, end string
		if e = tx.QueryRow(c, `SELECT rts.rider_id,s.start_time::text,s.end_time::text FROM rider_time_slots rts JOIN time_slots s ON s.id=rts.time_slot_id JOIN users u ON u.id=rts.rider_id WHERE rts.time_slot_id=$1 AND rts.rider_id<>$2 LIMIT 1`, x.TimeSlotID, riderID).Scan(&assignedRiderID, &start, &end); e != nil {
			err(c, 500, e)
			return
		}
		slotConflict(c, x.TimeSlotID, assignedRiderID, start, end, assignedRider)
		return
	}
	if assigned {
		err(c, 409, fmt.Errorf("this time slot is already assigned to this rider"))
		return
	}
	result, e := tx.Exec(c, `INSERT INTO rider_time_slots(rider_id,time_slot_id) VALUES($1,$2) ON CONFLICT(rider_id,time_slot_id) DO NOTHING`, riderID, x.TimeSlotID)
	if e != nil {
		err(c, 500, e)
		return
	}
	if result.RowsAffected() == 0 {
		err(c, 409, fmt.Errorf("this time slot is already assigned to this rider"))
		return
	}
	if e = tx.Commit(c); e != nil {
		err(c, 500, e)
		return
	}
	c.JSON(201, gin.H{"ok": true})
}

func (h *H) AdminSetRiderSlots(c *gin.Context) {
	riderID, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil {
		err(c, 400, fmt.Errorf("invalid rider"))
		return
	}
	var x struct {
		TimeSlotIDs []int64 `json:"time_slot_ids"`
	}
	if c.ShouldBindJSON(&x) != nil {
		err(c, 400, fmt.Errorf("time_slot_ids required"))
		return
	}
	seen := map[int64]bool{}
	date := strings.TrimSpace(c.Query("date"))
	if date != "" {
		if _, e = time.Parse("2006-01-02", date); e != nil {
			err(c, 400, fmt.Errorf("invalid assignment date"))
			return
		}
	}
	for _, slotID := range x.TimeSlotIDs {
		if slotID < 1 {
			err(c, 400, fmt.Errorf("invalid time slot"))
			return
		}
		if seen[slotID] {
			err(c, 409, fmt.Errorf("duplicate time slot assignment"))
			return
		}
		seen[slotID] = true
	}
	tx, e := h.DB.Begin(c)
	if e != nil {
		err(c, 500, e)
		return
	}
	defer tx.Rollback(c)
	var active bool
	if e = tx.QueryRow(c, `SELECT EXISTS(SELECT 1 FROM users u JOIN riders r ON r.user_id=u.id WHERE u.id=$1 AND u.role='rider' AND u.is_active=true)`, riderID).Scan(&active); e != nil || !active {
		err(c, 409, fmt.Errorf("rider must be active"))
		return
	}
	if len(x.TimeSlotIDs) > 0 {
		if _, e = tx.Exec(c, `SELECT id FROM time_slots WHERE id=ANY($1) FOR UPDATE`, x.TimeSlotIDs); e != nil {
			err(c, 500, e)
			return
		}
		var assignedRider string
		var assignedRiderID, assignedSlotID int64
		var assignedStart, assignedEnd string
		if e = tx.QueryRow(c, `SELECT s.id,rts.rider_id,s.start_time::text,s.end_time::text,u.name FROM rider_time_slots rts JOIN time_slots s ON s.id=rts.time_slot_id JOIN users u ON u.id=rts.rider_id WHERE rts.time_slot_id=ANY($1) AND rts.rider_id<>$2 LIMIT 1`, x.TimeSlotIDs, riderID).Scan(&assignedSlotID, &assignedRiderID, &assignedStart, &assignedEnd, &assignedRider); e == nil {
			slotConflict(c, assignedSlotID, assignedRiderID, assignedStart, assignedEnd, assignedRider)
			return
		}
		if e != pgx.ErrNoRows {
			err(c, 500, e)
			return
		}
		var inactive int
		query := `SELECT COUNT(*) FROM time_slots WHERE id=ANY($1) AND (is_active=false`
		args := []any{x.TimeSlotIDs}
		if date != "" {
			query += ` OR slot_date<>$2`
			args = append(args, date)
		}
		query += `)`
		if e = tx.QueryRow(c, query, args...).Scan(&inactive); e != nil {
			err(c, 500, e)
			return
		}
		if inactive > 0 {
			err(c, 409, fmt.Errorf("inactive time slots cannot be assigned"))
			return
		}
	}
	deleteQuery := `DELETE FROM rider_time_slots WHERE rider_id=$1`
	deleteArgs := []any{riderID}
	if date != "" {
		deleteQuery += ` AND time_slot_id IN (SELECT id FROM time_slots WHERE slot_date=$2)`
		deleteArgs = append(deleteArgs, date)
	}
	if _, e = tx.Exec(c, deleteQuery, deleteArgs...); e != nil {
		err(c, 500, e)
		return
	}
	for _, slotID := range x.TimeSlotIDs {
		if _, e = tx.Exec(c, `INSERT INTO rider_time_slots(rider_id,time_slot_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, riderID, slotID); e != nil {
			err(c, 500, e)
			return
		}
	}
	if e = tx.Commit(c); e != nil {
		err(c, 500, e)
		return
	}
	c.JSON(200, gin.H{"ok": true, "assigned": len(x.TimeSlotIDs)})
}
func (h *H) AdminRemoveSlot(c *gin.Context) {
	riderID, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil {
		err(c, 400, fmt.Errorf("invalid rider"))
		return
	}
	slotID, e := strconv.ParseInt(c.Param("slotID"), 10, 64)
	if e != nil {
		err(c, 400, fmt.Errorf("invalid time slot"))
		return
	}
	h.DB.Exec(c, `DELETE FROM rider_time_slots WHERE rider_id=$1 AND time_slot_id=$2`, riderID, slotID)
	c.Status(204)
}
func (h *H) notifyRiderAssignment(c *gin.Context, riderID, orderID int64) {
	var orderNumber string
	var total float64
	var slotDate, slotStart, slotEnd string
	if h.DB.QueryRow(c, `SELECT o.order_number,o.total,o.delivery_date::text,s.start_time::text,s.end_time::text FROM orders o JOIN time_slots s ON s.id=o.time_slot_id WHERE o.id=$1`, orderID).Scan(&orderNumber, &total, &slotDate, &slotStart, &slotEnd) != nil {
		return
	}
	data := map[string]any{"order_id": orderID, "order_number": orderNumber, "total": total, "delivery_date": slotDate, "slot_start_time": slotStart, "slot_end_time": slotEnd, "type": "order_assigned"}
	message := fmt.Sprintf("Order %s has been assigned to you for %s %s-%s.", orderNumber, slotDate, slotStart, slotEnd)
	_ = h.insertNotification(c, riderID, "New Order Assigned", message, "order_assigned", data)
	_ = sendPush(h.pushTokensForUser(c, riderID), "New Order Assigned", message, data)
}
func (h *H) AdminSlot(c *gin.Context) {
	var x struct {
		SlotDate  string `json:"slot_date"`
		StartTime string `json:"start_time"`
		EndTime   string `json:"end_time"`
		MaxOrders int    `json:"max_orders"`
		IsActive  bool   `json:"is_active"`
	}
	if c.ShouldBindJSON(&x) != nil || x.MaxOrders < 1 {
		err(c, 400, fmt.Errorf("invalid slot"))
		return
	}
	start, startErr := time.Parse("15:04", x.StartTime)
	end, endErr := time.Parse("15:04", x.EndTime)
	if _, dateErr := time.Parse("2006-01-02", x.SlotDate); dateErr != nil || startErr != nil || endErr != nil || end.Sub(start) != time.Hour {
		err(c, 400, fmt.Errorf("delivery time slots must be exactly one hour"))
		return
	}
	var sid int
	e := h.DB.QueryRow(c, `INSERT INTO time_slots(slot_date,start_time,end_time,max_orders,is_active) VALUES($1,$2,$3,$4,$5) RETURNING id`, x.SlotDate, x.StartTime, x.EndTime, x.MaxOrders, x.IsActive).Scan(&sid)
	if e != nil {
		err(c, 409, fmt.Errorf("a time slot with the same date and time already exists"))
		return
	}
	c.JSON(201, gin.H{"id": sid})
}
func (h *H) AdminUpdateSlot(c *gin.Context) {
	sid, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil {
		err(c, 400, fmt.Errorf("invalid time slot"))
		return
	}
	var x struct {
		SlotDate  string `json:"slot_date"`
		StartTime string `json:"start_time"`
		EndTime   string `json:"end_time"`
		MaxOrders int    `json:"max_orders"`
		IsActive  bool   `json:"is_active"`
	}
	if c.ShouldBindJSON(&x) != nil || x.SlotDate == "" || x.StartTime == "" || x.EndTime == "" || x.MaxOrders < 1 {
		err(c, 400, fmt.Errorf("invalid slot"))
		return
	}
	start, startErr := time.Parse("15:04", x.StartTime)
	end, endErr := time.Parse("15:04", x.EndTime)
	if _, dateErr := time.Parse("2006-01-02", x.SlotDate); dateErr != nil || startErr != nil || endErr != nil || end.Sub(start) != time.Hour {
		err(c, 400, fmt.Errorf("delivery time slots must be exactly one hour"))
		return
	}
	var booked int
	if e = h.DB.QueryRow(c, `SELECT booked_orders FROM time_slots WHERE id=$1`, sid).Scan(&booked); e != nil {
		err(c, 404, fmt.Errorf("time slot not found"))
		return
	}
	if x.MaxOrders < booked {
		err(c, 409, fmt.Errorf("capacity cannot be lower than current booked orders"))
		return
	}
	result, e := h.DB.Exec(c, `UPDATE time_slots SET slot_date=$1,start_time=$2,end_time=$3,max_orders=$4,is_active=$5 WHERE id=$6`, x.SlotDate, x.StartTime, x.EndTime, x.MaxOrders, x.IsActive, sid)
	if e != nil {
		err(c, 400, fmt.Errorf("time slot conflicts with an existing slot or is invalid"))
		return
	}
	if result.RowsAffected() == 0 {
		err(c, 404, fmt.Errorf("time slot not found"))
		return
	}
	c.JSON(200, gin.H{"ok": true})
}
func (h *H) AdminDeleteSlot(c *gin.Context) {
	sid, e := strconv.ParseInt(c.Param("id"), 10, 64)
	if e != nil {
		err(c, 400, fmt.Errorf("invalid time slot"))
		return
	}
	var booked int
	if e = h.DB.QueryRow(c, `SELECT booked_orders FROM time_slots WHERE id=$1`, sid).Scan(&booked); e != nil {
		err(c, 404, fmt.Errorf("time slot not found"))
		return
	}
	if booked > 0 {
		err(c, 409, fmt.Errorf("cannot delete a time slot with booked orders; deactivate it instead"))
		return
	}
	if _, e = h.DB.Exec(c, `DELETE FROM time_slots WHERE id=$1`, sid); e != nil {
		err(c, 500, e)
		return
	}
	c.Status(204)
}
func (h *H) AdminPrice(c *gin.Context) {
	var x struct {
		ProductID           int64   `json:"product_id"`
		BasePrice           float64 `json:"base_price"`
		NotificationMessage string  `json:"notification_message"`
	}
	if c.ShouldBindJSON(&x) != nil || x.ProductID < 1 || x.BasePrice < 0 {
		err(c, 400, fmt.Errorf("invalid price"))
		return
	}
	var name, image, unit string
	var oldPrice float64
	e := h.DB.QueryRow(c, `SELECT name,COALESCE(image_url,''),unit_type,base_price FROM products WHERE id=$1`, x.ProductID).Scan(&name, &image, &unit, &oldPrice)
	if e != nil {
		err(c, 404, fmt.Errorf("product not found"))
		return
	}
	if _, e = h.DB.Exec(c, `UPDATE products SET base_price=$1,updated_at=now() WHERE id=$2`, x.BasePrice, x.ProductID); e != nil {
		err(c, 500, e)
		return
	}
	sent, failed := h.notifyPriceUpdate(c, x.ProductID, name, image, unit, oldPrice, x.BasePrice, x.NotificationMessage)
	c.JSON(200, gin.H{"ok": true, "sent": sent, "failed": failed})
}

func (h *H) notifyPriceUpdate(ctx context.Context, productID int64, name, image, unit string, oldPrice, newPrice float64, customMessage string) (int, int) {
	message := strings.TrimSpace(customMessage)
	if message == "" {
		if newPrice < oldPrice {
			message = fmt.Sprintf("%s price dropped from Rs. %.0f to Rs. %.0f per %s.", name, oldPrice, newPrice, unit)
		} else if newPrice > oldPrice {
			message = fmt.Sprintf("%s price updated from Rs. %.0f to Rs. %.0f per %s.", name, oldPrice, newPrice, unit)
		} else {
			message = fmt.Sprintf("%s price is now Rs. %.0f per %s.", name, newPrice, unit)
		}
	}
	data := map[string]any{"product_id": productID, "product_name": name, "product_image": image, "old_price": oldPrice, "new_price": newPrice, "unit_type": unit, "type": "price_update"}
	rows, _ := h.DB.Query(ctx, `SELECT id FROM users WHERE role='customer' AND is_active=true`)
	sent := 0
	failed := 0
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var uid int64
			if rows.Scan(&uid) == nil {
				_ = h.insertNotification(ctx, uid, "Price Update", message, "price_update", data)
				tokens := h.pushTokensForUser(ctx, uid)
				if len(tokens) > 0 {
					if pushErr := sendPush(tokens, "FreshCart Price Update", message, data); pushErr != nil {
						failed++
						continue
					}
					sent++
				}
			}
		}
	}
	return sent, failed
}
func (h *H) AdminCategory(c *gin.Context) {
	var x struct {
		Name, Icon, Description string
		IsActive                bool `json:"is_active"`
	}
	if c.ShouldBindJSON(&x) != nil || x.Name == "" {
		err(c, 400, fmt.Errorf("category name required"))
		return
	}
	var cid int64
	e := h.DB.QueryRow(c, `INSERT INTO categories(name,icon,description,is_active) VALUES($1,$2,$3,$4) RETURNING id`, x.Name, x.Icon, x.Description, x.IsActive).Scan(&cid)
	if e != nil {
		err(c, 409, e)
		return
	}
	c.JSON(201, gin.H{"id": cid})
}
func (h *H) AdminUpdateCategory(c *gin.Context) {
	cid, _ := strconv.ParseInt(c.Param("id"), 10, 64)
	var x struct {
		Name, Icon, Description string
		IsActive                bool `json:"is_active"`
	}
	c.ShouldBindJSON(&x)
	_, e := h.DB.Exec(c, `UPDATE categories SET name=$1,icon=$2,description=$3,is_active=$4,updated_at=now() WHERE id=$5`, x.Name, x.Icon, x.Description, x.IsActive, cid)
	if e != nil {
		err(c, 500, e)
		return
	}
	c.JSON(200, gin.H{"ok": true})
}
func (h *H) Seed(ctx context.Context) {
	var n int
	h.DB.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&n)
	if n > 0 {
		return
	}
	mk := func(name, email, pw, role string) int64 {
		p, _ := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
		var i int64
		h.DB.QueryRow(ctx, `INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id`, name, email, string(p), role).Scan(&i)
		return i
	}
	r := mk("Azeem Tahir Rider", "rider@gmail.com", "FreshCart123", "rider")
	h.DB.Exec(ctx, `INSERT INTO riders(user_id,vehicle) VALUES($1,'Bike')`, r)
	mk("FreshCart Admin", "admin@gmail.com", "FreshCart123", "admin")
	mk("Azeem Tahir Customer", "customer@gmail.com", "FreshCart123", "customer")
	for day := 0; day < 14; day++ {
		d := time.Now().AddDate(0, 0, day).Format("2006-01-02")
		for _, x := range [][2]string{{"9:00", "10:00"}, {"10:00", "11:00"}, {"11:00", "12:00"}, {"12:00", "13:00"}, {"13:00", "14:00"}, {"14:00", "15:00"}, {"15:00", "16:00"}, {"16:00", "17:00"}, {"17:00", "18:00"}} {
			h.DB.Exec(ctx, `INSERT INTO time_slots(slot_date,start_time,end_time,max_orders,is_active) VALUES($1,$2,$3,10,true) ON CONFLICT DO NOTHING`, d, x[0], x[1])
		}
	}
}
