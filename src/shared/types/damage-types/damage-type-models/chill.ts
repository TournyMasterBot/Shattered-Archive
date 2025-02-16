import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Chill extends DamageType implements IDamageType {
    private static instance: Chill; 
    
    constructor() {
        super({
            id: "chill",
            name: "Chill",
            type: DslDamageType.Chill,
            resistanceCategories: [
            ]
        });
    }

    public static GetInstance(): Chill {
        if (!Chill.instance) {
            Chill.instance = new Chill();
        }
        return Chill.instance;
    }

    public Get<T>(): T {
        return Chill.GetInstance() as T;
    }
}

export default Chill;