import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class ShockingBite extends DamageType implements IDamageType {
    private static instance: ShockingBite; 
    
    constructor() {
        super({
            id: "shbite",
            name: "ShockingBite",
            type: DslDamageType.ShockingBite,
            resistanceCategories: [
            ]
        });
    }
    
    public static GetInstance(): ShockingBite {
        if (!ShockingBite.instance) {
            ShockingBite.instance = new ShockingBite();
        }
        return ShockingBite.instance;
    }

    public Get<T>(): T {
        return ShockingBite.GetInstance() as T;
    }
}

export default ShockingBite;