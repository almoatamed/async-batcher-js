import { createAsyncBatcher } from ".";

// imagine that this is the database server content
const mockDatabase = {
    users: [
        {
            id: "u1",
            name: "Aisha Khan",
            email: "aisha.khan@example.com",
        },
        {
            id: "u2",
            name: "Liam Carter",
            email: "liam.carter@example.org",
        },
        {
            id: "u3",
            name: "Sofia Martinez",
            email: "sofia.martinez@example.net",
        },
        {
            id: "u4",
            name: "Noah Schmidt",
            email: "noah.schmidt@example.com",
        },
        {
            id: "u5",
            name: "Maya Patel",
            email: "maya.patel@example.org",
        },
        {
            id: "u6",
            name: "Ethan Brown",
            email: "ethan.brown@example.io",
        },
    ] satisfies User[],
};

// imagine that it is indexed fast bridged sql select runs on sql server
function selectUsersMany(ids: string[]) {
    return mockDatabase.users.filter((u) => {
        return ids.includes(u.id);
    });
}

type UserIdType = string;
type User = {
    id: string;
    name: string;
    email: string;
};

const batcher = createAsyncBatcher<UserIdType, User>({
    batcherCallback(promises, timeoutAbortSignal) {
        const users = selectUsersMany(promises.map((p) => p.content)).reduce(
            (usersMap, user) => {
                usersMap[user.id] = user;
                return usersMap;
            },
            {} as {
                [key: string]: User;
            }
        );
        for (const promise of promises) {
            const user = users[promise.content];
            if (user) {
                promise.resolve(user);
            } else {
                promise.reject(new Error("user not found"));
            }
        }
    },
    batchPeriodInMs: 1e3, // 1 Second
    timeoutPeriod: 60e3, // 1 Minute
});

// now let us imagine that we have authentication server that requires
// grabbing the user from the database for each request,
// and we get like more thant 10,000 request per second.
// instead for each request we query the user id individually we query it as batch with one run which will save us great time and resource

// example http handler

const decodeJWT = (jwt: string) => {
    // imagine breaking up the jwt and returning some userid
    return {
        userId: `u${Math.floor(Math.random() * 100)}`,
    };
};

async function httpHandlerAuthorizationMiddleware(
    request: {
        headers: {
            Authorization: string;
        };
        meta: {
            user: undefined | User;
        };
    },
    response: {
        json: (data: any) => void;
    },
    next: () => void
) {
    try {
        const userId = decodeJWT(request.headers.Authorization).userId;
        const user = await batcher.run(userId);
        if (!user) {
            return response.json({
                errors: [
                    {
                        error: "User not found",
                        code: "USER_NOT_FOUND",
                    },
                ],
                status: 404,
            });
        }

        request.meta.user = user;
        next();
    } catch (error) {
        console.error(error);
        return response.json({
            errors: [
                {
                    error: "Invalid jwt",
                    code: "UNAUTHORIZED",
                },
            ],
            status: 401,
        });
    }
}
