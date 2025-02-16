import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Armor from "@shared/types/ability-types/spells/armor";
import Fireproof from "@shared/types/ability-types/spells/fireproof";
import Sanctuary from "@shared/types/ability-types/spells/sanctuary";
import ProtectionFire from "@shared/types/ability-types/spells/protection-fire";
import ProximityDispel from "@shared/types/ability-types/spells/proximity-dispel";
import Cancellation from "@shared/types/ability-types/spells/cancellation";
import ProtectionEvil from "@shared/types/ability-types/spells/protection-evil";
import Shield from "@shared/types/ability-types/spells/shield";
import ProtectionCold from "@shared/types/ability-types/spells/protection-cold";
import DispelMagic from "@shared/types/ability-types/spells/dispel-magic";
import ProtectionGood from "@shared/types/ability-types/spells/protection-good";
import StoneSkin from "@shared/types/ability-types/spells/stone-skin";
import ProtectionNeutral from "@shared/types/ability-types/spells/protection-neutral";

export class Protective implements IAbilityGroup {
    static instance: Protective;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.Protective;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilities = [
            Armor.GetInstance().Get(),
            Fireproof.GetInstance().Get(),
            Sanctuary.GetInstance().Get(),
            ProtectionFire.GetInstance().Get(),
            ProximityDispel.GetInstance().Get(),
            Cancellation.GetInstance().Get(),
            ProtectionEvil.GetInstance().Get(),
            Shield.GetInstance().Get(),
            ProtectionCold.GetInstance().Get(),
            DispelMagic.GetInstance().Get(),
            ProtectionGood.GetInstance().Get(),
            StoneSkin.GetInstance().Get(),
            ProtectionNeutral.GetInstance().Get()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): Protective {
        if (!Protective.instance) {
            Protective.instance = new Protective();
        }
        return Protective.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return Protective.GetInstance() as T;
    }
}

export default Protective;
