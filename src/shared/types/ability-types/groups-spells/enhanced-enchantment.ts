import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Disenchant from "@shared/types/ability-types/spells/disenchant";
import RestoreArmor from "@shared/types/ability-types/spells/restore-armor";
import AnimateObject from "@shared/types/ability-types/spells/animate-object";
import InvoluntaryWizardry from "@shared/types/ability-types/spells/involuntary-wizardry";
import Sequestor from "@shared/types/ability-types/spells/sequestor";
import WitheringEnchant from "@shared/types/ability-types/spells/withering-enchant";
import InterlaceSpirit from "@shared/types/ability-types/spells/interlace-spirit";
import WavesOfWeariness from "@shared/types/ability-types/spells/waves-of-weariness";
import EnchantingTouch from "@shared/types/ability-types/spells/enchanting-touch";
import RestoreWeapon from "@shared/types/ability-types/spells/restore-weapon";
import EnchantGem from "@shared/types/ability-types/spells/enchant-gem";
import Jest from "@shared/types/ability-types/spells/jest";
import ContinualLight from "@shared/types/ability-types/spells/continual-light";

export class EnhancedEnchantment implements IAbilityGroup {
    static instance: EnhancedEnchantment;
    public abilityGroup: AbilityGroup;
    public abilityGroupType: AbilityGroupType;
    public abilities: IAbility[];

    constructor() {
        this.abilityGroup = AbilityGroup.EnhancedEnchantment;
        this.abilityGroupType = AbilityGroupType.Spells;
        this.abilities = [
            Disenchant.GetInstance().Get(),
            RestoreArmor.GetInstance().Get(),
            AnimateObject.GetInstance().Get(),
            InvoluntaryWizardry.GetInstance().Get(),
            Sequestor.GetInstance().Get(),
            WitheringEnchant.GetInstance().Get(),
            InterlaceSpirit.GetInstance().Get(),
            WavesOfWeariness.GetInstance().Get(),
            EnchantingTouch.GetInstance().Get(),
            RestoreWeapon.GetInstance().Get(),
            EnchantGem.GetInstance().Get(),
            Jest.GetInstance().Get(),
            ContinualLight.GetInstance().Get()
        ];
    }

    // Method to get the single instance of the class
    public static GetInstance(): EnhancedEnchantment {
        if (!EnhancedEnchantment.instance) {
            EnhancedEnchantment.instance = new EnhancedEnchantment();
        }
        return EnhancedEnchantment.instance;
    }

    // Method to get the class instance, used in the context of IAbility
    public Get<T>(): T {
        return EnhancedEnchantment.GetInstance() as T;
    }
}

export default EnhancedEnchantment;
