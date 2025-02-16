import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Blizzard from "@shared/types/ability-types/spells/blizzard";
import Firestorm from "@shared/types/ability-types/spells/firestorm";
import SummonElemental from "@shared/types/ability-types/spells/summon-elemental";

export class Elemental implements IAbilityGroup {
    static instance: Elemental;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.Elemental;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilities = [
            Blizzard.GetInstance().Get(),
            Firestorm.GetInstance().Get(),
            SummonElemental.GetInstance().Get()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): Elemental {
        if (!Elemental.instance) {
            Elemental.instance = new Elemental();
        }
        return Elemental.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Elemental.GetInstance() as T;
    }
}

export default Elemental;
