import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Beating extends DamageType implements IDamageType {
    private static instance: Beating; 
    
    constructor() {
        super({
            id: "beating",
            name: "Beating",
            type: DslDamageType.Beating,
            resistanceCategories: [
            ]
        });
    }
    
    public static GetInstance(): Beating {
        if (!Beating.instance) {
            Beating.instance = new Beating();
        }
        return Beating.instance;
    }

    public Get<T>(): T {
        return Beating.GetInstance() as T;
    }
}

export default Beating;