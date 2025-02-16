import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import MetalStorm from "@shared/types/ability-types/spells/metal-storm";
import ForceField from "@shared/types/ability-types/spells/force-field";
import ControlMetal from "@shared/types/ability-types/spells/control-metal";
import FlamingSoul from "@shared/types/ability-types/spells/flaming-soul";

export class Metal implements IAbilityGroup {
    static instance: Metal;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.Metal;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilities = [
            MetalStorm.GetInstance().Get(),
            ForceField.GetInstance().Get(),
            ControlMetal.GetInstance().Get(),
            FlamingSoul.GetInstance().Get()
        ];
    }

    public Get<T>(): T {
        if (!Metal.instance) {
            Metal.instance = new Metal();
        }
        return Metal.instance as T;
    }
}

export default Metal;
