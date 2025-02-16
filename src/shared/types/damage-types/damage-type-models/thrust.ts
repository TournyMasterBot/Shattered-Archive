import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Thrust extends DamageType implements IDamageType {
    private static instance: Thrust; 
    
    constructor() {
        super({
            id: "thrust",
            name: "Thrust",
            type: DslDamageType.Thrust,
            resistanceCategories: [
            ]
        });
    }
    
    public static GetInstance(): Thrust {
        if (!Thrust.instance) {
            Thrust.instance = new Thrust();
        }
        return Thrust.instance;
    }

    public Get<T>(): T {
        return Thrust.GetInstance() as T;
    }
}

export default Thrust;