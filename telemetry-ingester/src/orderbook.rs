use common::models::{Order, OrderSide, OrderType};
use std::collections::{BTreeMap, HashMap};
use ordered_float::OrderedFloat;

#[derive(Debug, Clone)]
pub struct ExpectedFill {
    pub order_id: String,
    pub price: f64,
    pub quantity: f64,
}

pub struct Orderbook {
    // price -> queue of (order_id, remaining_qty)
    bids: BTreeMap<OrderedFloat<f64>, Vec<(String, f64)>>,
    asks: BTreeMap<OrderedFloat<f64>, Vec<(String, f64)>>,
    // order_id -> price (to handle cancels)
    active_orders: HashMap<String, (OrderSide, f64)>,
}

impl Orderbook {
    pub fn new() -> Self {
        Self {
            bids: BTreeMap::new(),
            asks: BTreeMap::new(),
            active_orders: HashMap::new(),
        }
    }

    pub fn process_order(&mut self, order: Order) -> Vec<ExpectedFill> {
        let mut fills = Vec::new();

        if order.order_type == OrderType::Cancel {
            if let Some((side, price)) = self.active_orders.remove(&order.order_id) {
                let price_key = OrderedFloat(price);
                if side == OrderSide::Buy {
                    if let Some(queue) = self.bids.get_mut(&price_key) {
                        queue.retain(|(id, _)| id != &order.order_id);
                        if queue.is_empty() {
                            self.bids.remove(&price_key);
                        }
                    }
                } else {
                    if let Some(queue) = self.asks.get_mut(&price_key) {
                        queue.retain(|(id, _)| id != &order.order_id);
                        if queue.is_empty() {
                            self.asks.remove(&price_key);
                        }
                    }
                }
            }
            return fills; // Cancels don't generate fills
        }

        let mut remaining_qty = order.quantity;

        if order.side == OrderSide::Buy {
            // Match against Asks (lowest first)
            let mut empty_levels = Vec::new();
            for (price_key, queue) in self.asks.iter_mut() {
                let ask_price = price_key.into_inner();
                if order.order_type == OrderType::Limit && ask_price > order.price {
                    break; // Can't match higher than limit price
                }

                let mut q_idx = 0;
                while q_idx < queue.len() && remaining_qty > 0.0 {
                    let (maker_id, maker_qty) = &mut queue[q_idx];
                    let fill_qty = remaining_qty.min(*maker_qty);
                    
                    fills.push(ExpectedFill {
                        order_id: order.order_id.clone(), // Taker fill
                        price: ask_price,
                        quantity: fill_qty,
                    });
                    
                    // Note: We don't track maker fills for the taker's ack validation, 
                    // since the contestant's HTTP ack is only for the taker order right now.
                    // A real exchange streams maker fills too, but our dummy-engine only returns 
                    // an Ack for the submitted order.

                    *maker_qty -= fill_qty;
                    remaining_qty -= fill_qty;

                    if *maker_qty <= 0.0 {
                        self.active_orders.remove(maker_id);
                        q_idx += 1;
                    } else {
                        break; // Taker is fully filled
                    }
                }

                // Clean up fully filled maker orders
                if q_idx > 0 {
                    queue.drain(0..q_idx);
                }

                if queue.is_empty() {
                    empty_levels.push(*price_key);
                }

                if remaining_qty <= 0.0 {
                    break;
                }
            }

            for p in empty_levels {
                self.asks.remove(&p);
            }

            // If Limit order and still quantity left, rest on book
            if remaining_qty > 0.0 && order.order_type == OrderType::Limit {
                let price_key = OrderedFloat(order.price);
                self.bids
                    .entry(price_key)
                    .or_insert_with(Vec::new)
                    .push((order.order_id.clone(), remaining_qty));
                self.active_orders.insert(order.order_id, (OrderSide::Buy, order.price));
            }

        } else {
            // Match against Bids (highest first)
            // BTreeMap iter() is ascending, so we need to reverse it for Bids
            let mut empty_levels = Vec::new();
            for (price_key, queue) in self.bids.iter_mut().rev() {
                let bid_price = price_key.into_inner();
                if order.order_type == OrderType::Limit && bid_price < order.price {
                    break; // Can't match lower than limit price
                }

                let mut q_idx = 0;
                while q_idx < queue.len() && remaining_qty > 0.0 {
                    let (maker_id, maker_qty) = &mut queue[q_idx];
                    let fill_qty = remaining_qty.min(*maker_qty);
                    
                    fills.push(ExpectedFill {
                        order_id: order.order_id.clone(),
                        price: bid_price,
                        quantity: fill_qty,
                    });

                    *maker_qty -= fill_qty;
                    remaining_qty -= fill_qty;

                    if *maker_qty <= 0.0 {
                        self.active_orders.remove(maker_id);
                        q_idx += 1;
                    } else {
                        break;
                    }
                }

                if q_idx > 0 {
                    queue.drain(0..q_idx);
                }

                if queue.is_empty() {
                    empty_levels.push(*price_key);
                }

                if remaining_qty <= 0.0 {
                    break;
                }
            }

            for p in empty_levels {
                self.bids.remove(&p);
            }

            if remaining_qty > 0.0 && order.order_type == OrderType::Limit {
                let price_key = OrderedFloat(order.price);
                self.asks
                    .entry(price_key)
                    .or_insert_with(Vec::new)
                    .push((order.order_id.clone(), remaining_qty));
                self.active_orders.insert(order.order_id, (OrderSide::Sell, order.price));
            }
        }

        fills
    }
}
