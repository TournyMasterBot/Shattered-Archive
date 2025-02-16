import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class MetalStorm implements IAbility {
    private static instance: MetalStorm;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Metal Storm";
        this.helpFile = `
help wujen
Metal Storm - Pulling shards of metal from their surroundings, the Wu Jen
creates a cloud of jagged metal that slice into their enemies, pelting
anyone not grouped with them with splinters that cut and damage them for a
short time after.
        `;
        this.abilityGroupType = AbilityGroupType.Spells; // Set to 'Spells'
        this.abilityUsage = AbilityUsage.Active;

        if (MetalStorm.instance === undefined) {
            MetalStorm.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): MetalStorm {
        if (!MetalStorm.instance) {
            MetalStorm.instance = new MetalStorm();
        }
        return MetalStorm.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return MetalStorm.GetInstance() as T;
    }
}

export default MetalStorm;