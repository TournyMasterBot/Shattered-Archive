import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Divine extends DamageType implements IDamageType {
    private static instance: Divine; 
    
    constructor() {
        super({
            id: "divine",
            name: "Divine",
            type: DslDamageType.Divine,
            resistanceCategories: [
            ]
        });
    }
    
    public static GetInstance(): Divine {
        if (!Divine.instance) {
            Divine.instance = new Divine();
        }
        return Divine.instance;
    }

    public Get<T>(): T {
        return Divine.GetInstance() as T;
    }
}

export default Divine;