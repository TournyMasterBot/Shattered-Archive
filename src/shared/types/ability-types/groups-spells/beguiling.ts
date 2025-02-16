import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Calm from "@shared/types/ability-types/spells/calm";
import RestoreMind from "@shared/types/ability-types/spells/restore-mind";
import CharmPerson from "@shared/types/ability-types/spells/charm-person";
import Betray from "@shared/types/ability-types/spells/betray";
import Sleep from "@shared/types/ability-types/spells/sleep";

export class Beguiling implements IAbilityGroup {
    static instance: Beguiling;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.Beguiling;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilities = [
            Calm.GetInstance().Get(),
            RestoreMind.GetInstance().Get(),
            CharmPerson.GetInstance().Get(),
            Betray.GetInstance().Get(),
            Sleep.GetInstance().Get(),
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): Beguiling {
        if (!Beguiling.instance) {
            Beguiling.instance = new Beguiling();
        }
        return Beguiling.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Beguiling.GetInstance() as T;
    }
}

export default Beguiling;
