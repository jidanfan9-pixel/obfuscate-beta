local function greet(playerName: string)
    local message = `Hello, {playerName}!`
    print(message)
    return message
end

local result = greet("Builder")
