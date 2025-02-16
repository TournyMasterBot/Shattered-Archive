import { DslDamageType } from "@shared/types/damage-types/damage-type";
import { DamageType } from "@shared/types/damage-types/damage-type";
import { IDamageType } from "@shared/types/damage-types/damage-type-interface";

export class Slice extends DamageType implements IDamageType {
    private static instance: Slice; 
    
    constructor() {
        super({
            id: "slice",
            name: "Slice",
            type: DslDamageType.Slice,
            resistanceCategories: [
            ]
        });
    }
    
    public static GetInstance(): Slice {
        if (!Slice.instance) {
            Slice.instance = new Slice();
        }
        return Slice.instance;
    }

    public Get<T>(): T {
        return Slice.GetInstance() as T;
    }
}

export default Slice;