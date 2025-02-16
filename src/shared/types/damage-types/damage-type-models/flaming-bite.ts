import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class FlamingBite extends DamageType implements IDamageType {
    private static instance: FlamingBite; 
    
    constructor() {
        super({
            id: "flbite",
            name: "FlamingBite",
            type: DslDamageType.FlamingBite,
            resistanceCategories: [
            ]
        });
    }
    
    public static GetInstance(): FlamingBite {
        if (!FlamingBite.instance) {
            FlamingBite.instance = new FlamingBite();
        }
        return FlamingBite.instance;
    }

    public Get<T>(): T {
        return FlamingBite.GetInstance() as T;
    }
}

export default FlamingBite;