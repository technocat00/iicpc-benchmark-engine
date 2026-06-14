#include <iostream>
#include <string>
#include <unordered_map>

// A simple C++ mock matching engine for testing the upload UI
int main() {
    std::cout << "Initializing IICPC High-Frequency Trading Engine (Mock)..." << std::endl;
    std::cout << "Listening on port 8080 for HTTP REST/WebSocket orders." << std::endl;

    // Simulate an infinite event loop waiting for orders
    while (true) {
        // In a real submission, we would run a blazing fast HTTP server like Drogon or Crow here
        // and maintain a lock-free orderbook (std::map for bids/asks).
    }

    return 0;
}
