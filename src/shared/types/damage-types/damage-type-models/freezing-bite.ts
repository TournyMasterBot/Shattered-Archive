import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class FreezingBite extends DamageType implements IDamageType {
    private static instance: FreezingBite; 
    
    constructor() {
        super({
            id: "frbite",
            name: "FreezingBite",
            type: DslDamageType.FreezingBite,
            resistanceCategories: [
            ]
        });
    }
    
    public static GetInstance(): FreezingBite {
        if (!FreezingBite.instance) {
            FreezingBite.instance = new FreezingBite();
        }
        return FreezingBite.instance;
    }

    public Get<T>(): T {
        return FreezingBite.GetInstance() as T;
    }
}

export default FreezingBite;