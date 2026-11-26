"""Research profiles for newly added products; applied idempotently at startup."""
from db import db

PROFILES = {
    'mvd-1-sana-100mg': {
        'overview': 'MVD-1 (SANA; 2-hydroxy-5-(2-nitrovinyl)benzoic acid, a salicylate-derived nitroalkene) is a synthetic small molecule in which a nitroalkene group is appended to a salicylate scaffold. It is studied in vitro as a mild mitochondrial uncoupler and electrophilic signalling modulator, with research interest in adipocyte thermogenesis, cellular energetics and metabolic signalling pathways.',
        'molecular_class': 'Salicylate-derived nitroalkene (electrophilic small molecule)',
        'molecular_formula': 'C9H7NO5',
        'molecular_weight': '209.16 g/mol',
        'sequence': 'Not applicable (non-peptide small molecule)',
        'receptor_target': 'No single receptor; acts as a protonophoric mitochondrial uncoupler and Michael-acceptor electrophile (Keap1/Nrf2, NF-κB pathway cysteines)',
        'signalling': 'Nitroalkenes react reversibly with nucleophilic cysteine residues on signalling proteins. In cell models this has been associated with Nrf2 activation, inhibition of NF-κB-dependent transcription, and increased mitochondrial proton leak with a compensatory rise in fatty-acid oxidation and AMPK phosphorylation.',
        'study_systems': [
            'Isolated mitochondria (oxygen consumption / membrane potential assays)',
            'Cultured adipocytes and brown-fat-like cell lines',
            'Hepatocyte and myotube cell lines',
            'Diet-induced-obesity rodent models (preclinical)',
        ],
        'areas_of_research': [
            'Mild mitochondrial uncoupling and energy expenditure',
            'Adipose thermogenesis and browning markers (UCP1)',
            'Electrophile-mediated Nrf2 / NF-κB signalling',
            'Hepatic lipid handling in vitro',
            'Metabolic flexibility and AMPK signalling',
        ],
        'key_finding': 'Preclinical work from the Uruguayan nitroalkene programme reported that SANA increases mitochondrial oxygen consumption and reduces membrane potential in a dose-dependent manner, while raising thermogenic and fatty-acid-oxidation markers in adipose and liver tissue of diet-induced-obese rodents. Early human safety work has been reported in abstract form; efficacy data remain preliminary.',
        'mechanism': 'The nitroalkene moiety enables SANA to shuttle protons across the inner mitochondrial membrane, partially dissipating the proton gradient and increasing substrate oxidation independent of ATP demand. The same electrophilic group forms reversible adducts with regulatory cysteines, modulating redox-sensitive transcription factors. Unlike classical uncouplers (e.g. DNP), the effect is reported to be self-limiting at higher concentrations.',
        'limitations': 'Most data derive from in-vitro assays and rodent models from a small number of research groups. Dose–response windows, long-term cellular effects and off-target electrophilic reactivity are incompletely characterised. Human clinical evidence is limited to early-phase reports.',
        'open_questions': 'How selective is SANA for mitochondrial versus cytosolic protein targets at research-relevant concentrations? Does the uncoupling effect persist with chronic exposure in cell culture, and what governs the apparent self-limiting ceiling?',
        'storage_handling': 'Supplied as 100mg capsules, 30 per tub. Store sealed in a cool, dry place away from light. For in-vitro laboratory research use only — not for human or animal consumption.',
        'references': [
            {'citation': 'Dapueto R et al. A salicylate-derived nitroalkene (SANA) mild mitochondrial uncoupler protects against diet-induced obesity in mice. Redox Biol. 2021.', 'url': ''},
            {'citation': 'Schopfer FJ, Khoo NKH. Nitro-fatty acid and nitroalkene signalling: mechanisms and therapeutic opportunities. Trends Pharmacol Sci. 2019;40(6):409-420.', 'url': ''},
            {'citation': 'Demine S et al. Mitochondrial uncoupling: a key controller of biological processes in physiology and diseases. Cells. 2019;8(8):795.', 'url': ''},
        ],
        'pubmed_query': '"SANA" nitroalkene salicylate mitochondrial uncoupler OR "MVD-1" nitroalkene',
    },
    'cartalax-20mg': {
        'overview': 'Cartalax is a short synthetic tripeptide (Ala-Glu-Asp) from the Khavinson series of peptide bioregulators, originally derived from cartilage tissue extracts. It is studied in vitro for its influence on chondrocyte and fibroblast gene expression, extracellular-matrix synthesis and cell proliferation in connective-tissue cell models.',
        'molecular_class': 'Synthetic tripeptide bioregulator (Khavinson peptide)',
        'molecular_formula': 'C12H19N3O8',
        'molecular_weight': '333.29 g/mol',
        'sequence': 'Ala-Glu-Asp (AED)',
        'receptor_target': 'No classical receptor identified; proposed direct interaction with DNA/chromatin and transcription-factor binding sites',
        'signalling': 'Short bioregulator peptides are proposed to pass into the nucleus and modulate transcription of tissue-specific genes. For AED, reported changes include altered expression of matrix metalloproteinases, collagen types I/II and proliferation markers (Ki-67) in cultured connective-tissue cells.',
        'study_systems': [
            'Primary human chondrocyte cultures',
            'Dermal fibroblast cell lines',
            'Organotypic cartilage tissue cultures',
            'Aged rodent cartilage models (preclinical)',
        ],
        'areas_of_research': [
            'Chondrocyte proliferation and matrix synthesis',
            'Collagen and proteoglycan gene expression',
            'Peptide–DNA interaction models',
            'Cellular senescence markers in connective tissue',
            'Epigenetic regulation by short peptides',
        ],
        'key_finding': 'Work from the St Petersburg Institute of Bioregulation and Gerontology reports that AED increases proliferative activity and collagen-related gene expression in cultured cartilage and fibroblast cells, with effects on senescence-associated markers in aged tissue cultures. Molecular-modelling studies propose sequence-specific binding of the tripeptide to DNA.',
        'mechanism': 'The proposed mechanism involves the tripeptide entering cells and the nucleus, where it is suggested to bind promoter regions and alter chromatin accessibility, shifting transcription of cartilage-matrix and cell-cycle genes. Direct biochemical confirmation of this model remains limited.',
        'limitations': 'The literature originates largely from a single research institute and is often published in Russian-language journals with small sample sizes. Independent replication, pharmacokinetic characterisation and rigorous target validation are lacking.',
        'open_questions': 'Does AED exert sequence-specific effects on chromatin in independent cell systems? Which transport mechanisms allow nuclear accumulation of a tripeptide in vitro?',
        'storage_handling': 'Supplied as 20mg lyophilised powder per vial (≥98% purity). Store sealed at -20 °C protected from light and moisture; reconstituted solutions should be kept at 2–8 °C and used promptly. For in-vitro laboratory research use only — not for human or animal consumption.',
        'references': [
            {'citation': 'Khavinson VKh et al. Peptide regulation of gene expression and protein synthesis in bronchial epithelium and cartilage. Bull Exp Biol Med. 2014.', 'url': ''},
            {'citation': 'Khavinson V, Linkova N, Dyatlova A, et al. Peptides: prospects for use in the treatment of age-related diseases — short peptides and cell cultures. Biomolecules. 2020.', 'url': ''},
            {'citation': 'Fedoreyeva LI et al. Penetration of short fluorescence-labelled peptides into the nucleus in HeLa cells and in vitro specific interaction of the peptides with deoxyribooligonucleotides and DNA. Biochemistry (Mosc). 2011;76(11):1210-1219.', 'url': ''},
        ],
        'pubmed_query': 'Cartalax OR "Ala-Glu-Asp" tripeptide Khavinson cartilage',
    },
}


async def apply_new_profiles():
    for slug, profile in PROFILES.items():
        await db.products.update_one({'slug': slug, 'research_profile': {'$exists': False}}, {'$set': {'research_profile': profile}})
