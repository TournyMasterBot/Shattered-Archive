import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import AbilityUsage from "@shared/types/ability-types/ability-usage";

export class EnergyDrain implements IAbility {
    private static instance: EnergyDrain;

    name: string;
    helpFile: string;
    abilityGroupType: AbilityGroupType;
    abilityUsage: AbilityUsage;

    constructor() {
        this.name = "Energy Drain";
        this.helpFile = `
help 'Energy Drain'
'ENERGY DRAIN'
ENERGY DRAIN

Syntax: cast 'energy drain' <target>

This spell saps the mana and movement points of its target.  

Necromancers get a special bonus when casting this spell and it is more
difficult to save against when cast by necromancers.`;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilityUsage = AbilityUsage.Active;

        if (EnergyDrain.instance === undefined) {
            EnergyDrain.instance = this;
        }
    }

    // Method to get the single instance of the class
    public static GetInstance(): EnergyDrain {
        if (!EnergyDrain.instance) {
            EnergyDrain.instance = new EnergyDrain();
        }
        return EnergyDrain.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return EnergyDrain.GetInstance() as T;
    }
}

export default EnergyDrain;