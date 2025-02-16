import IAbility from "@shared/types/ability-types/ability";
import AbilityGroupType from "@shared/types/ability-types/ability-group-type";
import IAbilityGroup from "@shared/types/ability-types/ability-group-interface";
import AbilityGroup from "@shared/types/ability-types/ability-group";
import Astrology from "@shared/types/ability-types/skills/astrology";
import Enhancement from "@shared/types/ability-types/groups-spells/enhancement";
import Detection from "../groups-spells/detection";
import Combat from "../groups-spells/combat";
import Transportation from "../groups-spells/transportation";
import EnhancedEnchantment from "../groups-spells/enhanced-enchantment";
import Protective from "../groups-spells/protective";
import Beguiling from "../groups-spells/beguiling";
import Enchantment from "../groups-spells/enchantment";

export class EnchantorDefault implements IAbilityGroup {
  static instance: EnchantorDefault;
  public abilityGroup: AbilityGroup;
  public abilityGroupType: AbilityGroupType;
  public abilities: IAbility[];

  constructor() {
    this.abilityGroup = AbilityGroup.EnchantorDefault;
    this.abilityGroupType = AbilityGroupType.Default;
    this.abilities = [
      ...Enhancement.GetInstance().Get<Enhancement>().abilities,
      ...Detection.GetInstance().Get<Detection>().abilities,
      ...Combat.GetInstance().Get<Combat>().abilities,
      ...Transportation.GetInstance().Get<Transportation>().abilities,
      ...EnhancedEnchantment.GetInstance().Get<EnhancedEnchantment>().abilities,
      ...Protective.GetInstance().Get<Protective>().abilities,
      ...Beguiling.GetInstance().Get<Beguiling>().abilities,
      ...Enchantment.GetInstance().Get<Enchantment>().abilities,
      Astrology.GetInstance().Get(),
    ];
  }

  // Method to get the single instance of the class
  public static GetInstance(): EnchantorDefault {
    if (!EnchantorDefault.instance) {
      EnchantorDefault.instance = new EnchantorDefault();
    }
    return EnchantorDefault.instance;
  }

  // Method to get the class instance, used in the context of IAbility
  public Get<T>(): T {
    return EnchantorDefault.GetInstance() as T;
  }
}

export default EnchantorDefault;
